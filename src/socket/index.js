import { Server } from 'socket.io';
import { Logger } from '../config/logger.js';
import { prisma } from '../config/db.js';
import { chatService } from '../features/chat/chat.service.js';

const log = new Logger('SocketServer');
let io;

const billingTimers = new Map();
const callBillingTimers = new Map();
const callWarningState = new Map();
const chatWarningState = new Map();

let callServicePromise = null;
function getCallService() {
    if (!callServicePromise) {
        callServicePromise = import('../features/call/call.service.js').then((m) => m.callService);
    }
    return callServicePromise;
}


async function setConsultantStatus(userId, status) {
    try {
        const consultant = await prisma.consultant.findUnique({
            where: { userId },
            select: { id: true },
        });

        if (!consultant) return; // not a consultant, skip

        await prisma.consultant.update({
            where: { userId },
            data: { onlineStatus: status }, // 'ONLINE' | 'OFFLINE' | 'BUSY'
        });

        // Broadcast to every connected client
        io.emit('consultant_status_changed', { userId, status });
        log.info(`👤 Consultant ${userId} → ${status}`);
    } catch (err) {
        log.error(`setConsultantStatus error: ${err.message}`);
    }
}

/**
 * On server restart, mark ALL consultants OFFLINE.
 * Their sockets are gone so we can't trust any ONLINE state.
 */
async function resetAllConsultantsOffline() {
    try {
        const count = await prisma.consultant.updateMany({
            where: { onlineStatus: { not: 'OFFLINE' } },
            data: { onlineStatus: 'OFFLINE' },
        });
        log.info(`Reset ${count.count} consultant(s) to OFFLINE on boot`);
    } catch (err) {
        log.error(`resetAllConsultantsOffline error: ${err.message}`);
    }
}

// ─────────────────────────────────────────────────────────────
// BILLING TIMER
// ─────────────────────────────────────────────────────────────

export function startBillingTimer(conversationId) {
    if (billingTimers.has(conversationId)) {
        log.warn(`Billing timer already running for: ${conversationId}`);
        return;
    }

    log.info(`💰 Starting billing timer for conversation: ${conversationId}`);

    const timer = setInterval(async () => {
        try {
            const conv = await prisma.chatConversation.findUnique({
                where: { id: conversationId },
                select: {
                    startedAt: true,
                    totalMinutes: true,
                    sessionStatus: true,
                    billingUserId: true,
                },
            });

            if (!conv || conv.sessionStatus !== 'ACTIVE') {
                log.info(`Session not active for ${conversationId}, stopping timer`);
                stopBillingTimer(conversationId);
                return;
            }

            const elapsedSeconds = (Date.now() - new Date(conv.startedAt).getTime()) / 1000;
            const completedMinutes = Math.floor(elapsedSeconds / 60);
            const alreadyBilled = parseInt(conv.totalMinutes || 0);
            const unbilled = completedMinutes - alreadyBilled;

            if (unbilled <= 0) return;

            log.info(`⏰ [${conversationId}] elapsed=${Math.floor(elapsedSeconds)}s completed=${completedMinutes} billed=${alreadyBilled} → billing ${unbilled}`);

            for (let i = 0; i < unbilled; i++) {
                const result = await chatService.billOneMinute(conversationId);

                if (!result) {
                    log.warn(`billOneMinute returned null for ${conversationId}`);
                    stopBillingTimer(conversationId);
                    return;
                }

                if (result.ended) {
                    log.info(`🏁 Session auto-ended (insufficient balance) for ${conversationId}`);
                    stopBillingTimer(conversationId);

                    const finalConv = await prisma.chatConversation.findUnique({
                        where: { id: conversationId },
                        select: { totalMinutes: true, totalCost: true, sessionType: true },
                    });

                    const endPayload = {
                        conversationId,
                        reason: result.reason,
                        totalMinutes: parseFloat(finalConv?.totalMinutes || 0),
                        totalCost: parseFloat(finalConv?.totalCost || 0),
                        sessionType: finalConv?.sessionType || result.sessionType,
                    };

                    io.to(`conv_${conversationId}`).emit('session_ended', endPayload);
                    const participants = await prisma.chatParticipant.findMany({
                        where: { conversationId },
                        select: { userId: true },
                    });
                    for (const p of participants) {
                        io.to(`user_${p.userId}`).emit('session_ended', endPayload);
                    }
                    return;
                }

                io.to(`conv_${conversationId}`).emit('billing_tick', {
                    conversationId,
                    minuteNumber: alreadyBilled + i + 1,
                    amountCharged: result.amountCharged,
                    balanceAfter: result.balanceAfter,
                    consultantShare: result.consultantShare,
                    platformShare: result.platformShare,
                });

                if (result.lowBalanceWarning && conv.billingUserId) {
                    const ws = chatWarningState.get(conversationId) || { ten: false, five: false };
                    const w = result.lowBalanceWarning;
                    let shouldEmit = false;
                    if (w.type === 'ten_minutes' && !ws.ten) {
                        ws.ten = true;
                        shouldEmit = true;
                    } else if (w.type === 'five_minutes' && !ws.five) {
                        ws.five = true;
                        shouldEmit = true;
                    } else if (w.type === 'critical') {
                        shouldEmit = true;
                    }
                    chatWarningState.set(conversationId, ws);
                    if (shouldEmit) {
                        io.to(`user_${conv.billingUserId}`).emit('balance_warning', {
                            conversationId,
                            ...w,
                        });
                    }
                }
            }
        } catch (err) {
            log.error(`Billing timer error for ${conversationId}: ${err.message}`);
        }
    }, 10_000);

    billingTimers.set(conversationId, timer);
    log.info(`✅ Billing timer started for conversation: ${conversationId}`);
}

export function stopBillingTimer(conversationId) {
    const timer = billingTimers.get(conversationId);
    if (timer) {
        clearInterval(timer);
        billingTimers.delete(conversationId);
        chatWarningState.delete(conversationId);
        log.info(`🛑 Billing timer stopped for conversation: ${conversationId}`);
    }
}

// ─────────────────────────────────────────────────────────────
// CALL BILLING TIMER (voice/video)
// ─────────────────────────────────────────────────────────────

export function emitCallBalanceWarning(userId, data) {
    if (io) io.to(`user_${userId}`).emit('call_balance_warning', data);
}

export async function autoEndCallInsufficient(callId, billingUserId) {
    stopCallBillingTimer(callId);
    const endTimestamp = Date.now();
    try {
        const callService = await getCallService();
        await prepareCallEnd(callId, billingUserId, endTimestamp);
        await callService.endCall(callId, billingUserId, endTimestamp, 'insufficient_balance');
    } catch (err) {
        log.error(`autoEndCallInsufficient failed for ${callId}: ${err.message}`);
    }
}

export function startCallBillingTimer(callId) {
    if (callBillingTimers.has(callId)) return;

    log.info(`💰 Starting call billing timer for: ${callId}`);
    callWarningState.set(callId, { ten: false, five: false });

    const timer = setInterval(async () => {
        try {
            const callService = await getCallService();
            const call = await prisma.call.findUnique({
                where: { id: callId },
                select: { status: true, startTime: true, userId: true },
            });

            if (!call || call.status !== 'ACTIVE') {
                stopCallBillingTimer(callId);
                return;
            }

            const warnState = callWarningState.get(callId) || { ten: false, five: false };
            const monitor = await callService.monitorCallBalance(callId, warnState);
            callWarningState.set(callId, monitor.warningState || warnState);

            if (monitor.warning && monitor.userId) {
                emitCallBalanceWarning(monitor.userId, { callId, ...monitor.warning });
            }

            if (monitor.shouldEnd) {
                await autoEndCallInsufficient(callId, call.userId);
                return;
            }

            if (!call.startTime) return;

            const elapsedSeconds = (Date.now() - new Date(call.startTime).getTime()) / 1000;
            const completedMinutes = Math.floor(elapsedSeconds / 60);
            const billedCount = await prisma.callBilling.count({ where: { callId } });
            const unbilled = completedMinutes - billedCount;

            for (let i = 0; i < unbilled; i++) {
                const result = await callService.billCallMinute(callId);
                if (!result) {
                    stopCallBillingTimer(callId);
                    return;
                }
                if (result.ended) {
                    await autoEndCallInsufficient(callId, call.userId);
                    return;
                }
                if (result.lowBalanceWarning && result.userId) {
                    const ws = callWarningState.get(callId) || { ten: false, five: false };
                    const w = result.lowBalanceWarning;
                    let shouldEmit = false;
                    if (w.type === 'ten_minutes' && !ws.ten) {
                        ws.ten = true;
                        shouldEmit = true;
                    } else if (w.type === 'five_minutes' && !ws.five) {
                        ws.five = true;
                        shouldEmit = true;
                    } else if (w.type === 'critical') {
                        shouldEmit = true;
                    }
                    callWarningState.set(callId, ws);
                    if (shouldEmit) {
                        emitCallBalanceWarning(result.userId, { callId, ...w });
                    }
                }
                if (io && result.userId) {
                    io.to(`user_${result.userId}`).emit('call_billing_tick', {
                        callId,
                        amountCharged: result.amountCharged,
                        balanceAfter: result.balanceAfter,
                        minuteNumber: result.minuteNumber,
                    });
                }
            }
        } catch (err) {
            log.error(`Call billing timer error for ${callId}: ${err.message}`);
        }
    }, 10_000);

    callBillingTimers.set(callId, timer);
}

export function stopCallBillingTimer(callId) {
    const timer = callBillingTimers.get(callId);
    if (timer) {
        clearInterval(timer);
        callBillingTimers.delete(callId);
        callWarningState.delete(callId);
        log.info(`🛑 Call billing timer stopped for: ${callId}`);
    }
}

async function restoreActiveCalls() {
    try {
        const activeCalls = await prisma.call.findMany({
            where: { status: 'ACTIVE' },
            select: { id: true },
        });
        for (const call of activeCalls) {
            startCallBillingTimer(call.id);
        }
        if (activeCalls.length > 0) {
            log.info(`Restored ${activeCalls.length} active call billing timer(s)`);
        }
    } catch (err) {
        log.error(`Failed to restore active calls: ${err.message}`);
    }
}

async function restoreActiveSessions() {
    try {
        const activeSessions = await prisma.chatConversation.findMany({
            where: { sessionStatus: 'ACTIVE' },
            select: { id: true },
        });
        for (const session of activeSessions) {
            log.info(`Restoring billing timer for active session: ${session.id}`);
            startBillingTimer(session.id);
        }
        log.info(`Restored ${activeSessions.length} active billing timer(s)`);
    } catch (err) {
        log.error(`Failed to restore active sessions: ${err.message}`);
    }
}

// ─────────────────────────────────────────────────────────────
// SOCKET INIT
// ─────────────────────────────────────────────────────────────

export const initSocket = (httpServer) => {
    const allowedOrigins = [
        process.env.FRONTEND_URL || 'http://localhost:5173',
        'http://localhost:5173',
        'http://localhost:3000',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:3000',
    ];

    io = new Server(httpServer, {
        cors: {
            origin: (origin, callback) => {
                if (!origin || allowedOrigins.includes(origin) || /localhost|127\.0\.0\.1/.test(origin)) {
                    callback(null, true);
                } else {
                    callback(null, true);
                }
            },
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        },
        transports: ['websocket', 'polling'],
        pingTimeout: 60000,
        pingInterval: 25000,
    });

    // On boot: reset stale online statuses & restore billing timers
    resetAllConsultantsOffline();
    restoreActiveSessions();
    restoreActiveCalls();

    io.on('connection', (socket) => {
        log.info(`Client connected: ${socket.id}`);

        // ── PRESENCE: Register
        socket.on('register', async (userId) => {
            if (!userId) {
                socket.emit('registered', { error: 'No userId provided' });
                return;
            }

            socket.userId = userId;

            [...socket.rooms].forEach(room => {
                if (room !== socket.id && (room.startsWith('user_') || room.startsWith('conv_'))) {
                    socket.leave(room);
                }
            });

            socket.join(`user_${userId}`);
            log.info(`User ${userId} registered → room user_${userId}`);

            try {
                const participations = await prisma.chatParticipant.findMany({
                    where: { userId },
                    select: { conversationId: true },
                });
                for (const p of participations) {
                    socket.join(`conv_${p.conversationId}`);
                }
                log.info(`User ${userId} joined ${participations.length} conversation room(s)`);
            } catch (err) {
                log.warn(`Failed to join conversation rooms for ${userId}: ${err.message}`);
            }

            socket.emit('registered', {
                success: true,
                userId,
                socketId: socket.id,
                room: `user_${userId}`,
            });

            await setConsultantStatus(userId, 'ONLINE');
        });

        // ── PRESENCE: Heartbeat 
        socket.on('heartbeat', () => {
            socket.lastHeartbeat = Date.now();
            // Optionally ack back so client can detect stale connections
            socket.emit('heartbeat_ack');
        });

        // ── PRESENCE: Manual status change

        socket.on('set_status', async ({ status }) => {
            if (!socket.userId) return;
            const allowed = ['ONLINE', 'OFFLINE', 'BUSY'];
            if (!allowed.includes(status)) return;
            await setConsultantStatus(socket.userId, status);
        });

        // ── PRESENCE: Offline on disconnect ────────────────────────
        socket.on('disconnect', async () => {
            log.info(`Client disconnected: ${socket.id}`);
            if (socket.userId) {

                setTimeout(async () => {
                    const sockets = await io.in(`user_${socket.userId}`).fetchSockets();
                    if (sockets.length === 0) {
                        await setConsultantStatus(socket.userId, 'OFFLINE');
                    } else {
                        log.info(`User ${socket.userId} reconnected quickly, keeping ONLINE`);
                    }
                }, 3000);
            }
        });

        // ── : Get or create conversation
        socket.on('get_conversation', async (data, callback) => {
            try {
                const conversation = await chatService.getOrCreateConversation(data.userId, data.otherUserId);
                socket.join(`conv_${conversation.id}`);
                callback({ success: true, conversation });
            } catch (err) {
                callback({ success: false, error: err.message });
            }
        });

        socket.on('join_conversation', async (data) => {
            if (!data?.conversationId) return;
            socket.join(`conv_${data.conversationId}`);
            if (socket.userId) {
                try {
                    const participant = await prisma.chatParticipant.findFirst({
                        where: { conversationId: data.conversationId, userId: socket.userId },
                    });
                    if (!participant) {
                        socket.leave(`conv_${data.conversationId}`);
                    }
                } catch {
                    // ignore validation errors
                }
            }
        });

        //: Send message 
        socket.on('send_message', async (data, callback) => {
            try {
                const { conversationId, message } = data;
                const conv = await prisma.chatConversation.findUnique({
                    where: { id: conversationId },
                    select: { sessionStatus: true },
                });
                if (conv?.sessionStatus !== 'ACTIVE') {
                    if (callback) callback({ success: false, error: 'No active session.' });
                    return;
                }
                const senderUser = await prisma.user.findUnique({
                    where: { id: socket.userId },
                    select: { role: true },
                });
                const isConsultant = senderUser?.role === 'CONSULTANT' || senderUser?.role === 'ADMIN';
                if (!isConsultant) {
                    const wallet = await prisma.wallet.findUnique({ where: { userId: socket.userId } });
                    if (!wallet || parseFloat(wallet.creditBalance) < 0.10) {
                        if (callback) callback({ success: false, error: 'Insufficient balance.' });
                        return;
                    }
                }
                const newMessage = await prisma.chatMessage.create({
                    data: { conversationId, senderId: socket.userId, message, isRead: false },
                    include: { sender: { select: { id: true, name: true, avatar: true, role: true } } },
                });
                await prisma.chatConversation.update({
                    where: { id: conversationId },
                    data: { updatedAt: new Date() },
                });
                socket.to(`conv_${conversationId}`).emit('new_message', { conversationId, message: newMessage });
                const participants = await prisma.chatParticipant.findMany({
                    where: { conversationId },
                    select: { userId: true },
                });
                for (const p of participants) {
                    if (p.userId !== socket.userId) {
                        io.to(`user_${p.userId}`).emit('new_message', { conversationId, message: newMessage });
                    }
                }
                if (callback) callback({ success: true, message: newMessage });
            } catch (err) {
                if (callback) callback({ success: false, error: err.message });
            }
        });

        // ── CHAT: Send file ─────────────────────────────────────────
        socket.on('send_file', async (data, callback) => {
            try {
                const { conversationId, fileUrl, fileName, fileType, fileSize } = data;
                const newMessage = await prisma.chatMessage.create({
                    data: { conversationId, senderId: socket.userId, fileUrl, fileName, fileType, fileSize, isRead: false },
                    include: { sender: { select: { id: true, name: true, avatar: true } } },
                });
                await prisma.chatConversation.update({
                    where: { id: conversationId },
                    data: { updatedAt: new Date() },
                });
                socket.to(`conv_${conversationId}`).emit('new_file', { conversationId, message: newMessage });
                const participants = await prisma.chatParticipant.findMany({
                    where: { conversationId },
                    select: { userId: true },
                });
                for (const p of participants) {
                    if (p.userId !== socket.userId) {
                        io.to(`user_${p.userId}`).emit('new_file', { conversationId, message: newMessage });
                    }
                }
                if (callback) callback({ success: true, message: newMessage });
            } catch (err) {
                if (callback) callback({ success: false, error: err.message });
            }
        });

        // ── CHAT: Get messages ──────────────────────────────────────
        socket.on('get_messages', async (data, callback) => {
            try {
                const result = await chatService.getMessages(
                    data.conversationId,
                    socket.userId,
                    data.page || 1,
                    data.limit || 50,
                );
                callback({ success: true, ...result });
            } catch (err) {
                callback({ success: false, error: err.message });
            }
        });

        // ── CHAT: Mark read ─────────────────────────────────────────
        socket.on('mark_read', async (data) => {
            try {
                await chatService.markAllAsRead(data.conversationId, socket.userId);
                const messages = await prisma.chatMessage.findMany({
                    where: { conversationId: data.conversationId },
                    select: { senderId: true },
                    distinct: ['senderId'],
                });
                for (const m of messages) {
                    if (m.senderId !== socket.userId) {
                        io.to(`user_${m.senderId}`).emit('messages_read', {
                            conversationId: data.conversationId,
                            readBy: socket.userId,
                        });
                    }
                }
            } catch (err) {
                log.error(`mark_read error: ${err.message}`);
            }
        });

        // ── CHAT: Typing indicators ─────────────────────────────────
        socket.on('typing_start', async (data) => {
            try {
                const participants = await prisma.chatParticipant.findMany({
                    where: { conversationId: data.conversationId, NOT: { userId: socket.userId } },
                    select: { userId: true },
                });
                for (const p of participants) {
                    io.to(`user_${p.userId}`).emit('user_typing', {
                        conversationId: data.conversationId,
                        userId: socket.userId,
                        isTyping: true,
                    });
                }
            } catch (err) {
                log.error(`typing_start error: ${err.message}`);
            }
        });

        socket.on('typing_stop', async (data) => {
            try {
                const participants = await prisma.chatParticipant.findMany({
                    where: { conversationId: data.conversationId, NOT: { userId: socket.userId } },
                    select: { userId: true },
                });
                for (const p of participants) {
                    io.to(`user_${p.userId}`).emit('user_typing', {
                        conversationId: data.conversationId,
                        userId: socket.userId,
                        isTyping: false,
                    });
                }
            } catch (err) {
                log.error(`typing_stop error: ${err.message}`);
            }
        });

        // ── CHAT: Get conversations ─────────────────────────────────
        socket.on('get_conversations', async (callback) => {
            try {
                const conversations = await chatService.getUserConversations(socket.userId);
                callback({ success: true, conversations });
            } catch (err) {
                callback({ success: false, error: err.message });
            }
        });

        // ── SESSION: Start (request — billing begins on accept) ─────
        socket.on('start_session', async (data, callback) => {
            try {
                const { conversationId, sessionType = 'CHAT' } = data;
                log.info(`🎬 start_session socket: conv=${conversationId}, by=${socket.userId}`);

                const session = await chatService.startSession(conversationId, socket.userId, sessionType);

                socket.join(`conv_${conversationId}`);

                const participants = await prisma.chatParticipant.findMany({
                    where: { conversationId },
                    select: { userId: true },
                });

                const payload = {
                    conversationId,
                    sessionType: session?.sessionType || sessionType,
                    sessionStatus: 'PENDING',
                    pricePerMinute: 2.50,
                };
                io.to(`conv_${conversationId}`).emit('chat_request_pending', payload);
                for (const p of participants) {
                    io.to(`user_${p.userId}`).emit('chat_request_pending', payload);
                }

                if (callback) callback({ success: true, session });
            } catch (err) {
                log.error(`start_session error: ${err.message}`);
                if (callback) callback({ success: false, error: err.message });
            }
        });

        // ── SESSION: Accept (consultant) ────────────────────────────
        socket.on('accept_session', async (data, callback) => {
            try {
                const { conversationId } = data;
                log.info(`✅ accept_session socket: conv=${conversationId}, by=${socket.userId}`);

                const session = await chatService.acceptSession(conversationId, socket.userId);
                socket.join(`conv_${conversationId}`);
                await notifySessionAccepted(conversationId, session);

                if (callback) callback({ success: true, session });
            } catch (err) {
                log.error(`accept_session error: ${err.message}`);
                if (callback) callback({ success: false, error: err.message });
            }
        });

        // ── SESSION: Decline (consultant) ───────────────────────────
        socket.on('decline_session', async (data, callback) => {
            try {
                const { conversationId } = data;
                const session = await chatService.declineSession(conversationId, socket.userId);
                io.to(`conv_${conversationId}`).emit('chat_request_declined', { conversationId });
                if (callback) callback({ success: true, session });
            } catch (err) {
                log.error(`decline_session error: ${err.message}`);
                if (callback) callback({ success: false, error: err.message });
            }
        });

        // ── SESSION: End ────────────────────────────────────────────
        socket.on('end_session', async (data, callback) => {
            try {
                const { conversationId } = data;
                log.info(`🏁 end_session socket: conv=${conversationId}, by=${socket.userId}`);

                const endTimestamp = Date.now();
                await prepareSessionEnd(conversationId, endTimestamp);

                const result = await chatService.endSession(conversationId, 'user_ended', endTimestamp);

                if (!result) {
                    if (callback) callback({ success: false, error: 'Failed to end session' });
                    return;
                }

                if (!result.alreadyEnded) {
                    await notifySessionEnded(conversationId, result);
                }

                if (callback) callback({ success: true, ...result });
            } catch (err) {
                log.error(`end_session socket error: ${err.message}`);
                if (callback) callback({ success: false, error: err.message });
            }
        });
    });

    return io;
};

export const getIO = () => {
    if (!io) throw new Error('Socket.io not initialized');
    return io;
};

/** Broadcast pending chat request to conversation + consultant popup */
export async function notifyChatRequestPending(conversationId, extra = {}) {
    if (!io) return;
    const participants = await prisma.chatParticipant.findMany({
        where: { conversationId },
        select: { userId: true },
    });
    const payload = {
        conversationId,
        sessionType: extra.sessionType || 'CHAT',
        sessionStatus: 'PENDING',
        customerName: extra.customerName,
        customerId: extra.customerId,
        pricePerMinute: extra.pricePerMinute || 2.50,
    };
    io.to(`conv_${conversationId}`).emit('chat_request_pending', payload);
    for (const p of participants) {
        io.to(`user_${p.userId}`).emit('chat_request_pending', payload);
    }
    const consultantUserId = extra.consultantUserId;
    if (consultantUserId) {
        io.to(`user_${consultantUserId}`).emit('incoming_chat_request', payload);
    }
}

/** Start billing + notify both parties after consultant accepts (REST or socket) */
export async function notifySessionAccepted(conversationId, session) {
    if (!io) return;
    startBillingTimer(conversationId);

    const participants = await prisma.chatParticipant.findMany({
        where: { conversationId },
        select: { userId: true },
    });

    for (const p of participants) {
        const user = await prisma.user.findUnique({
            where: { id: p.userId },
            select: { role: true },
        });
        if (user?.role === 'CONSULTANT') {
            await setConsultantStatus(p.userId, 'BUSY');
        }
    }

    const payload = {
        conversationId,
        sessionType: session?.sessionType || 'CHAT',
        startedAt: session?.startedAt || new Date(),
        pricePerMinute: 2.50,
        sessionStatus: 'ACTIVE',
    };
    io.to(`conv_${conversationId}`).emit('session_started', payload);
    io.to(`conv_${conversationId}`).emit('chat_request_accepted', payload);
    for (const p of participants) {
        io.to(`user_${p.userId}`).emit('session_started', payload);
        io.to(`user_${p.userId}`).emit('chat_request_accepted', payload);
    }
}

export function notifyChatRequestDeclined(conversationId) {
    if (!io) return;
    const payload = { conversationId };
    io.to(`conv_${conversationId}`).emit('chat_request_declined', payload);
    prisma.chatParticipant.findMany({
        where: { conversationId },
        select: { userId: true },
    }).then((participants) => {
        for (const p of participants) {
            io.to(`user_${p.userId}`).emit('chat_request_declined', payload);
        }
    }).catch(() => {});
}

/** Broadcast new chat message to conversation + all participant user rooms */
export async function broadcastNewMessage(conversationId, message, senderId) {
    if (!io) return;
    const payload = { conversationId, message };
    io.to(`conv_${conversationId}`).emit('new_message', payload);
    const participants = await prisma.chatParticipant.findMany({
        where: { conversationId },
        select: { userId: true },
    });
    for (const p of participants) {
        io.to(`user_${p.userId}`).emit('new_message', payload);
    }
}

/** Stop billing timer and instantly notify both parties that session is ending */
export async function notifySessionEnding(conversationId, endTimestamp = Date.now()) {
    if (!io) return;

    const conv = await prisma.chatConversation.findUnique({
        where: { id: conversationId },
        select: { startedAt: true },
    });

    const durationSeconds = conv?.startedAt
        ? Math.floor((endTimestamp - new Date(conv.startedAt).getTime()) / 1000)
        : 0;

    const payload = {
        conversationId,
        endedAt: new Date(endTimestamp).toISOString(),
        durationSeconds: Math.max(0, durationSeconds),
        sessionStatus: 'ENDING',
    };

    io.to(`conv_${conversationId}`).emit('session_ending', payload);

    const participants = await prisma.chatParticipant.findMany({
        where: { conversationId },
        select: { userId: true },
    });
    for (const p of participants) {
        io.to(`user_${p.userId}`).emit('session_ending', payload);
    }
}

/** Stop timer + broadcast session_ending — call at the very start of end flow */
export async function prepareSessionEnd(conversationId, endTimestamp = Date.now()) {
    stopBillingTimer(conversationId);
    await notifySessionEnding(conversationId, endTimestamp);
}

/** Stop billing, reset consultant status, notify both parties session ended */
export async function notifySessionEnded(conversationId, result) {
    if (!io || !result) return;

    stopBillingTimer(conversationId);

    const participants = await prisma.chatParticipant.findMany({
        where: { conversationId },
        select: { userId: true },
    });

    for (const p of participants) {
        const user = await prisma.user.findUnique({
            where: { id: p.userId },
            select: { role: true },
        });
        if (user?.role === 'CONSULTANT') {
            const sockets = await io.in(`user_${p.userId}`).fetchSockets();
            if (sockets.length > 0) {
                await setConsultantStatus(p.userId, 'ONLINE');
            }
        }
    }

    const endPayload = {
        conversationId,
        totalMinutes: result.totalMinutes,
        totalCost: result.totalCost,
        durationSeconds: result.durationSeconds,
        reason: result.reason || 'user_ended',
        sessionType: result.sessionType,
    };

    io.to(`conv_${conversationId}`).emit('session_ended', endPayload);
    for (const p of participants) {
        io.to(`user_${p.userId}`).emit('session_ended', endPayload);
    }
}

export const emitIncomingCall = (consultantUserId, callData) => {
    if (io) io.to(`user_${consultantUserId}`).emit('incoming_call', callData);
};
export const emitCallAccepted = (userId, callData) => {
    if (io) io.to(`user_${userId}`).emit('call_accepted', callData);
};
export const emitCallRejected = (userId, callData) => {
    if (io) io.to(`user_${userId}`).emit('call_rejected', callData);
};

/** Instantly notify both call participants that the call is ending (before billing completes) */
export async function prepareCallEnd(callId, endedByUserId, endTimestamp = Date.now()) {
    if (!io) return endTimestamp;

    const call = await prisma.call.findUnique({
        where: { id: callId },
        select: {
            id: true, userId: true, consultantId: true,
            startTime: true, status: true, callType: true,
        },
    });

    if (!call) return endTimestamp;

    const durationSeconds = call.startTime && call.status === 'ACTIVE'
        ? Math.max(0, Math.floor((endTimestamp - new Date(call.startTime).getTime()) / 1000))
        : 0;

    const payload = {
        callId: call.id,
        endedBy: endedByUserId,
        endedAt: new Date(endTimestamp).toISOString(),
        durationSeconds,
        callType: call.callType,
        status: 'ENDING',
    };

    io.to(`user_${call.userId}`).emit('call_ending', payload);
    io.to(`user_${call.consultantId}`).emit('call_ending', payload);

    return endTimestamp;
}

export const emitCallEnded = (userId, callData) => {
    if (io) io.to(`user_${userId}`).emit('call_ended', callData);
};
import { Server } from 'socket.io';
import { Logger } from '../config/logger.js';
import { prisma } from '../config/db.js';
import { chatService } from '../features/chat/chat.service.js';

const log = new Logger('SocketServer');
let io;

const billingTimers = new Map();

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
            // ✅ Only bill COMPLETED whole minutes (Math.floor, NOT Math.ceil)
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
                    if (conv.billingUserId) {
                        io.to(`user_${conv.billingUserId}`).emit('session_ended', endPayload);
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
                    io.to(`user_${conv.billingUserId}`).emit('balance_warning', {
                        conversationId,
                        ...result.lowBalanceWarning,
                    });
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
        log.info(`🛑 Billing timer stopped for conversation: ${conversationId}`);
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

export const initSocket = (httpServer) => {
    io = new Server(httpServer, {
        cors: {
            origin: [process.env.FRONTEND_URL || 'http://localhost:5173', 'http://localhost:3000'],
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        },
    });

    restoreActiveSessions();

    io.on('connection', (socket) => {
        log.info(`Client connected: ${socket.id}`);

        socket.on('register', (userId) => {
            if (!userId) { socket.emit('registered', { error: 'No userId provided' }); return; }
            socket.userId = userId;
            [...socket.rooms].forEach(room => {
                if (room !== socket.id && room.startsWith('user_')) socket.leave(room);
            });
            socket.join(`user_${userId}`);
            log.info(`User ${userId} registered`);
            socket.emit('registered', { success: true, userId, socketId: socket.id, room: `user_${userId}` });
        });

        socket.on('get_conversation', async (data, callback) => {
            try {
                const conversation = await chatService.getOrCreateConversation(data.userId, data.otherUserId);
                socket.join(`conv_${conversation.id}`);
                callback({ success: true, conversation });
            } catch (err) { callback({ success: false, error: err.message }); }
        });

        socket.on('join_conversation', (data) => {
            socket.join(`conv_${data.conversationId}`);
        });

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
                const senderUser = await prisma.user.findUnique({ where: { id: socket.userId }, select: { role: true } });
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
                await prisma.chatConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
                socket.to(`conv_${conversationId}`).emit('new_message', { conversationId, message: newMessage });
                const participants = await prisma.chatParticipant.findMany({ where: { conversationId }, select: { userId: true } });
                for (const p of participants) {
                    if (p.userId !== socket.userId) io.to(`user_${p.userId}`).emit('new_message', { conversationId, message: newMessage });
                }
                if (callback) callback({ success: true, message: newMessage });
            } catch (err) {
                if (callback) callback({ success: false, error: err.message });
            }
        });

        socket.on('send_file', async (data, callback) => {
            try {
                const { conversationId, fileUrl, fileName, fileType, fileSize } = data;
                const newMessage = await prisma.chatMessage.create({
                    data: { conversationId, senderId: socket.userId, fileUrl, fileName, fileType, fileSize, isRead: false },
                    include: { sender: { select: { id: true, name: true, avatar: true } } },
                });
                await prisma.chatConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
                socket.to(`conv_${conversationId}`).emit('new_file', { conversationId, message: newMessage });
                const participants = await prisma.chatParticipant.findMany({ where: { conversationId }, select: { userId: true } });
                for (const p of participants) {
                    if (p.userId !== socket.userId) io.to(`user_${p.userId}`).emit('new_file', { conversationId, message: newMessage });
                }
                if (callback) callback({ success: true, message: newMessage });
            } catch (err) { if (callback) callback({ success: false, error: err.message }); }
        });

        socket.on('get_messages', async (data, callback) => {
            try {
                const result = await chatService.getMessages(data.conversationId, socket.userId, data.page || 1, data.limit || 50);
                callback({ success: true, ...result });
            } catch (err) { callback({ success: false, error: err.message }); }
        });

        socket.on('mark_read', async (data) => {
            try {
                await chatService.markAllAsRead(data.conversationId, socket.userId);
                const messages = await prisma.chatMessage.findMany({ where: { conversationId: data.conversationId }, select: { senderId: true }, distinct: ['senderId'] });
                for (const m of messages) {
                    if (m.senderId !== socket.userId) io.to(`user_${m.senderId}`).emit('messages_read', { conversationId: data.conversationId, readBy: socket.userId });
                }
            } catch (err) { log.error(`mark_read error: ${err.message}`); }
        });

        socket.on('typing_start', async (data) => {
            try {
                const participants = await prisma.chatParticipant.findMany({ where: { conversationId: data.conversationId, NOT: { userId: socket.userId } }, select: { userId: true } });
                for (const p of participants) io.to(`user_${p.userId}`).emit('user_typing', { conversationId: data.conversationId, userId: socket.userId, isTyping: true });
            } catch (err) { log.error(`typing_start error: ${err.message}`); }
        });

        socket.on('typing_stop', async (data) => {
            try {
                const participants = await prisma.chatParticipant.findMany({ where: { conversationId: data.conversationId, NOT: { userId: socket.userId } }, select: { userId: true } });
                for (const p of participants) io.to(`user_${p.userId}`).emit('user_typing', { conversationId: data.conversationId, userId: socket.userId, isTyping: false });
            } catch (err) { log.error(`typing_stop error: ${err.message}`); }
        });

        socket.on('get_conversations', async (callback) => {
            try {
                const conversations = await chatService.getUserConversations(socket.userId);
                callback({ success: true, conversations });
            } catch (err) { callback({ success: false, error: err.message }); }
        });

        // ── SESSION: Start ────────────────────────────────────────
        socket.on('start_session', async (data, callback) => {
            try {
                const { conversationId, sessionType = 'CHAT' } = data;
                log.info(`🎬 start_session socket: conv=${conversationId}, by=${socket.userId}`);

                let session;
                try {
                    session = await chatService.startSession(conversationId, socket.userId, sessionType);
                } catch (err) {
                    if (!err.message?.includes('already active')) throw err;
                    log.warn(`Session already active for ${conversationId} — starting timer anyway`);
                    session = await prisma.chatConversation.findUnique({ where: { id: conversationId } });
                }

                socket.join(`conv_${conversationId}`);
                startBillingTimer(conversationId);

                const participants = await prisma.chatParticipant.findMany({ where: { conversationId }, select: { userId: true } });
                const payload = {
                    conversationId,
                    sessionType: session?.sessionType || sessionType,
                    startedAt: session?.startedAt || new Date(),
                    pricePerMinute: 2.50,
                };
                io.to(`conv_${conversationId}`).emit('session_started', payload);
                for (const p of participants) io.to(`user_${p.userId}`).emit('session_started', payload);

                if (callback) callback({ success: true, session });
            } catch (err) {
                log.error(`start_session error: ${err.message}`);
                if (callback) callback({ success: false, error: err.message });
            }
        });

        // ── SESSION: End ──────────────────────────────────────────
        socket.on('end_session', async (data, callback) => {
            try {
                const { conversationId } = data;
                log.info(`🏁 end_session socket: conv=${conversationId}, by=${socket.userId}`);

                stopBillingTimer(conversationId);
                const result = await chatService.endSession(conversationId, 'user_ended');

                if (!result) {
                    if (callback) callback({ success: false, error: 'Failed to end session' });
                    return;
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
                const participants = await prisma.chatParticipant.findMany({ where: { conversationId }, select: { userId: true } });
                for (const p of participants) io.to(`user_${p.userId}`).emit('session_ended', endPayload);

                if (callback) callback({ success: true, ...endPayload });
            } catch (err) {
                log.error(`end_session socket error: ${err.message}`);
                if (callback) callback({ success: false, error: err.message });
            }
        });

        socket.on('disconnect', () => {
            log.info(`Client disconnected: ${socket.id}`);
        });
    });

    return io;
};

export const getIO = () => {
    if (!io) throw new Error('Socket.io not initialized');
    return io;
};

export const emitIncomingCall = (consultantUserId, callData) => {
    if (io) io.to(`user_${consultantUserId}`).emit('incoming_call', callData);
};
export const emitCallAccepted = (userId, callData) => {
    if (io) io.to(`user_${userId}`).emit('call_accepted', callData);
};
export const emitCallRejected = (userId, callData) => {
    if (io) io.to(`user_${userId}`).emit('call_rejected', callData);
};
export const emitCallEnded = (userId, callData) => {
    if (io) io.to(`user_${userId}`).emit('call_ended', callData);
};
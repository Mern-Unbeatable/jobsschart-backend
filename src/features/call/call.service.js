
import { prisma } from '../../config/db.js';
import { Logger } from '../../config/logger.js';
import {
    NotFoundError,
    ConflictError,
    BadRequestError,
    ForbiddenError
} from '../../shared/globals/helpers/error-handler.js';
import { twilioService } from '../../shared/services/twilio.service.js';
import { emitIncomingCall, emitCallAccepted, emitCallRejected, emitCallEnded } from '../../socket/index.js';
import { sessionService } from '../session/session.service.js';
const log = new Logger('CallService');


class CallService {

    async checkUserBalance(userId, consultantUserId) {
        const [wallet, consultantUser] = await Promise.all([
            prisma.wallet.findUnique({ where: { userId } }),
            prisma.user.findUnique({
                where: { id: consultantUserId },
                include: { consultant: { select: { pricePerMinute: true, isApproved: true, onlineStatus: true } } }
            }),
        ]);

        if (!wallet) {
            throw new BadRequestError('Wallet not found. Please purchase credits first.');
        }

        if (!consultantUser || !consultantUser.consultant) {
            throw new NotFoundError('Consultant not found');
        }

        const walletBalance = Number(wallet.creditBalance || 0);
        const requiredCredits = Number(consultantUser.consultant.pricePerMinute || 0);

        if (walletBalance < requiredCredits) {
            throw new BadRequestError(
                `Insufficient balance. Minimum ${requiredCredits.toFixed(2)} credits required. ` +
                `Current balance: ${walletBalance.toFixed(2)} credits. Please purchase more credits.`
            );
        }

        return { wallet, consultant: consultantUser.consultant, consultantUser };
    }



    async initiateCall(userId, consultantUserId, callType) {
        // ... existing balance/availability checks stay the same ...
        await this.checkUserBalance(userId, consultantUserId);

        // Check consultant availability
        const consultantUser = await prisma.user.findUnique({
            where: { id: consultantUserId },
            include: { consultant: true }
        });

        if (!consultantUser || !consultantUser.consultant) {
            throw new NotFoundError('Consultant not found');
        }

        const consultant = consultantUser.consultant;

        if (!consultant.isApproved) {
            throw new ForbiddenError('Consultant is not approved yet');
        }

        if (consultant.onlineStatus !== 'ONLINE') {
            throw new BadRequestError('Consultant is not online');
        }

        // Check for active calls
        const activeCall = await prisma.call.findFirst({
            where: {
                OR: [
                    { userId, status: { in: ['PENDING', 'ACTIVE'] } },
                    { consultantId: consultantUserId, status: { in: ['PENDING', 'ACTIVE'] } },
                ],
            },
        });

        if (activeCall) {
            throw new ConflictError('You already have an active call. Please end it first.');
        }
        // Generate unique room name
        const roomName = `call_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;

        // Get user info
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, name: true, email: true, avatar: true }
        });

        // Create call record
        const call = await prisma.call.create({
            data: {
                userId,
                consultantId: consultantUserId,
                callType,
                status: 'PENDING',
                startTime: new Date(),
                roomUrl: roomName,
            },
            include: {
                user: { select: { id: true, name: true, email: true, avatar: true } },
            },
        });

        // ✅ FIX: Create Twilio room for ALL call types (not just VIDEO)
        await twilioService.createRoom(roomName, call.id);

        // Generate tokens for both participants
        const userToken = twilioService.generateAccessToken(
            userId,
            user.name || user.email,
            roomName,
            callType
        );

        const consultantToken = twilioService.generateAccessToken(
            consultantUserId,
            consultantUser.name || consultantUser.email,
            roomName,
            callType
        );

        // Emit real-time notification to consultant via Socket.io
        emitIncomingCall(consultantUserId, {
            callId: call.id,
            callerId: userId,
            callerName: user.name,
            callerEmail: user.email,
            callerAvatar: user.avatar,
            callType: callType,
            roomName: roomName,
            token: consultantToken,
            timestamp: new Date().toISOString()
        });

        log.info(`Call initiated: ${call.id} - ${callType} call between ${userId} and ${consultantUserId}`);

        return {
            call: {
                id: call.id,
                roomName,
                status: call.status.toLowerCase(),
                callType: call.callType,
                startTime: call.startTime,
            },
            tokens: {
                user: { token: userToken, identity: user.name || user.email },
                consultant: { token: consultantToken, identity: consultantUser.name || consultantUser.email },
            },
        };
    }


    async acceptCall(callId, consultantUserId) {
        const call = await prisma.call.findUnique({
            where: { id: callId },
            include: {
                user: { select: { id: true, name: true, email: true, avatar: true } },
            }
        });

        if (!call) {
            throw new NotFoundError('Call not found');
        }

        if (call.consultantId !== consultantUserId) {
            throw new ForbiddenError('You are not the intended recipient of this call');
        }

        if (call.status !== 'PENDING') {
            throw new BadRequestError('Call is no longer pending');
        }

        // Update startTime to NOW when call is actually accepted
        const actualStartTime = new Date();

        const updatedCall = await prisma.call.update({
            where: { id: callId },
            data: {
                status: 'ACTIVE',
                startTime: actualStartTime
            }
        });

        const consultantUser = await prisma.user.findUnique({
            where: { id: consultantUserId },
            select: { id: true, name: true, avatar: true, email: true }
        });

        // ✅ Generate tokens for BOTH participants
        const userToken = twilioService.generateAccessToken(
            call.userId,
            call.user.name || call.user.email,
            call.roomUrl,
            call.callType
        );

        // ✅ FIX: Also generate consultant's token
        const consultantToken = twilioService.generateAccessToken(
            consultantUserId,
            consultantUser?.name || consultantUser?.email || 'Consultant',
            call.roomUrl,
            call.callType
        );

        // Send to user (caller)
        emitCallAccepted(call.userId, {
            callId: call.id,
            consultantId: consultantUserId,
            consultantName: consultantUser?.name,
            consultantAvatar: consultantUser?.avatar,
            roomName: call.roomUrl,
            token: userToken,
            actualStartTime: actualStartTime.toISOString()
        });

        log.info(`Call ${callId} accepted by consultant ${consultantUserId}`);

        return {
            call: {
                id: updatedCall.id,
                roomName: call.roomUrl,
                status: updatedCall.status.toLowerCase(),
                callType: call.callType,
                startTime: actualStartTime
            },
            token: userToken,
            consultantToken: consultantToken  // ✅ FIX: Return consultant token too
        };
    }


    async rejectCall(callId, consultantUserId) {
        const call = await prisma.call.findUnique({
            where: { id: callId },
            include: { user: { select: { id: true, name: true } } }
        });

        if (!call) {
            throw new NotFoundError('Call not found');
        }

        // Verify consultant is the intended recipient
        if (call.consultantId !== consultantUserId) {
            throw new ForbiddenError('You are not the intended recipient of this call');
        }

        if (call.status !== 'PENDING') {
            throw new BadRequestError('Call is no longer pending');
        }

        // Update call status to CANCELLED
        const cancelledCall = await prisma.call.update({
            where: { id: callId },
            data: { status: 'CANCELLED', endTime: new Date() }
        });

        // Emit call rejected to user via Socket.io
        emitCallRejected(call.userId, {
            callId: call.id,
            reason: 'Consultant rejected the call'
        });

        log.info(`Call ${callId} rejected by consultant ${consultantUserId}`);

        return { success: true, message: 'Call rejected', call: cancelledCall };
    }



    async joinCall(callId, userId, userRole) {
        const call = await prisma.call.findUnique({
            where: { id: callId },
            include: {
                user: { select: { id: true, name: true, email: true } },
            },
        });

        if (!call) {
            throw new NotFoundError('Call not found');
        }

        const isUser = call.userId === userId;
        const isConsultant = call.consultantId === userId;

        if (!isUser && !isConsultant && userRole !== 'ADMIN') {
            throw new ForbiddenError('You are not a participant of this call');
        }

        if (call.status === 'COMPLETED' || call.status === 'CANCELLED' || call.status === 'FAILED') {
            throw new BadRequestError('Call has already ended');
        }

        let startTime = call.startTime;

        // If this is the consultant joining and call is still pending
        if (isConsultant && call.status === 'PENDING') {
            startTime = new Date();
            await prisma.call.update({
                where: { id: callId },
                data: {
                    status: 'ACTIVE',
                    startTime: startTime
                },
            });
        } else if (call.status === 'PENDING') {
            await prisma.call.update({
                where: { id: callId },
                data: { status: 'ACTIVE' },
            });
        }

        let identity;
        if (isUser) {
            identity = call.user.name || call.user.email;
        } else {
            const consultantUser = await prisma.user.findUnique({
                where: { id: call.consultantId },
                select: { name: true, email: true }
            });
            identity = consultantUser?.name || consultantUser?.email || 'Consultant';
        }

        const token = twilioService.generateAccessToken(userId, identity, call.roomUrl, call.callType);

        log.info(`${isUser ? 'User' : 'Consultant'} ${userId} joined call ${callId} as ${identity}`);

        return {
            call: {
                id: call.id,
                roomName: call.roomUrl,
                status: call.status.toLowerCase(),
                callType: call.callType,
                startTime: startTime,
            },
            token,
            identity,
        };
    }

    async endCall(callId, userId) {
        const call = await prisma.call.findUnique({
            where: { id: callId },
            include: {
                user: { include: { wallet: true } },
                consultant: { include: { consultant: true } }
            },
        });

        if (!call) {
            throw new NotFoundError('Call not found');
        }

        const isUser = call.userId === userId;
        const isConsultant = call.consultantId === userId;

        if (!isUser && !isConsultant) {
            throw new ForbiddenError('You are not authorized to end this call');
        }

        if (call.status === 'COMPLETED') {
            throw new BadRequestError('Call already ended');
        }

        if (call.status === 'CANCELLED') {
            throw new BadRequestError('Call was cancelled');
        }

        // ✅ FIX: If call is still PENDING, cancel it (no billing)
        if (call.status === 'PENDING') {
            const cancelled = await prisma.call.update({
                where: { id: callId },
                data: { status: 'CANCELLED', endTime: new Date() },
            });

            const otherParticipantId = isUser ? call.consultantId : call.userId;
            emitCallEnded(otherParticipantId, {
                callId: call.id,
                endedBy: userId,
                durationSeconds: 0,
                totalCost: 0,
                reason: 'Call ended before being answered',
            });
            emitCallEnded(userId, {
                callId: call.id,
                endedBy: userId,
                durationSeconds: 0,
                totalCost: 0,
                reason: 'Call ended before being answered',
            });

            log.info(`Call ${callId} cancelled (was PENDING).`);

            return {
                id: call.id,
                durationSeconds: 0,
                totalCost: 0,
                consultantShare: 0,
                platformShare: 0,
                ratePerMinute: 0,
                status: 'CANCELLED',
                session: null,
            };
        }

        // ── ACTIVE call: calculate duration & bill ────────────────────
        const endTime = new Date();
        const startTime = new Date(call.startTime);

        let durationSeconds = Math.floor(
            (endTime.getTime() - startTime.getTime()) / 1000
        );
        const finalDurationSeconds = Math.max(1, Math.min(durationSeconds, 86400));

        // Use the already-included consultant instead of a separate query
        const consultantProfile = call.consultant?.consultant;
        if (!consultantProfile) {
            throw new NotFoundError('Consultant profile not found');
        }

        const ratePerMinute = consultantProfile.pricePerMinute || 2.5;
        const ratePerSecond = ratePerMinute / 60;

        const totalCost = Number(
            (finalDurationSeconds * ratePerSecond).toFixed(2)
        );
        const consultantShare = Number((totalCost * 0.5).toFixed(2));
        const platformShare = Number((totalCost * 0.5).toFixed(2));

        // ✅ FIX: Round up for Int fields — prevents crash when duration < 60s
        const billedMinutes = Math.ceil(finalDurationSeconds / 60);

        let session = null;

        await prisma.$transaction(async (tx) => {
            const wallet = await tx.wallet.findUnique({
                where: { userId: call.userId },
            });

            if (!wallet) {
                throw new NotFoundError('Wallet not found');
            }

            const balanceBefore = Number(wallet.creditBalance);
            const balanceAfter = Number((balanceBefore - totalCost).toFixed(2));

            await tx.wallet.update({
                where: { userId: call.userId },
                data: { creditBalance: balanceAfter },
            });

            await tx.creditTransaction.create({
                data: {
                    userId: call.userId,
                    transactionType: 'CALL_DEDUCTION',
                    amount: -totalCost,
                    callId: call.id,
                    description: `${call.callType} call - ${finalDurationSeconds}s @ €${ratePerMinute}/min`,
                    balanceBefore,
                    balanceAfter,
                },
            });

            await tx.call.update({
                where: { id: callId },
                data: {
                    status: 'COMPLETED',
                    endTime,
                    durationSeconds: finalDurationSeconds,
                    totalCost,
                },
            });

            await tx.callBilling.create({
                data: {
                    callId: call.id,
                    minuteNumber: billedMinutes,       // ✅ FIX: Int — was decimal before
                    creditsDeducted: totalCost,
                },
            });

            await tx.consultantEarning.create({
                data: {
                    consultantId: consultantProfile.id,
                    callId: call.id,
                    minutes: billedMinutes,             // ✅ FIX: Int — was decimal before
                    grossAmount: totalCost,
                    consultantShare,
                    platformShare,
                    isPaidOut: false,
                },
            });
        });

        // Create session record
        try {
            session = await sessionService.createFromCall(call, {
                finalDurationSeconds,
                totalCost,
                consultantEarning: consultantShare,
                platformEarning: platformShare,
                ratePerMinute,
            });
        } catch (sessionError) {
            log.error(`Failed to create session for call ${callId}: ${sessionError.message}`);
        }

        if (call.telecomCallId) {
            await twilioService.endRoom(call.telecomCallId);
        }

        const otherParticipantId = isUser ? call.consultantId : call.userId;

        // Emit to OTHER participant
        emitCallEnded(otherParticipantId, {
            callId: call.id,
            endedBy: userId,
            durationSeconds: finalDurationSeconds,
            totalCost,
            sessionId: session?.id,
        });

        // ✅ FIX: Also emit to the person who ended the call
        // This ensures both modals close properly via socket
        emitCallEnded(userId, {
            callId: call.id,
            endedBy: userId,
            durationSeconds: finalDurationSeconds,
            totalCost,
            sessionId: session?.id,
        });

        log.info(
            `Call ${callId} ended. Duration: ${finalDurationSeconds}s, Cost: €${totalCost}, Session: ${session?.id}`
        );

        return {
            id: call.id,
            durationSeconds: finalDurationSeconds,
            totalCost,
            consultantShare,
            platformShare,
            ratePerMinute,
            status: 'COMPLETED',
            session: session || null,
        };
    }

    async cancelCall(callId, userId) {
        const call = await prisma.call.findUnique({
            where: { id: callId },
        });

        if (!call) {
            throw new NotFoundError('Call not found');
        }

        const isUser = call.userId === userId;
        const isConsultant = call.consultantId === userId;

        if (!isUser && !isConsultant) {
            throw new ForbiddenError('You are not authorized to cancel this call');
        }

        if (call.status !== 'PENDING') {
            throw new BadRequestError('Only pending calls can be cancelled');
        }

        const cancelled = await prisma.call.update({
            where: { id: callId },
            data: { status: 'CANCELLED', endTime: new Date() },
        });

        const otherPartyId = isUser ? call.consultantId : call.userId;
        if (otherPartyId) {
            emitCallEnded(otherPartyId, {
                callId: call.id,
                reason: 'Call was cancelled by the other party'
            });
        }

        log.info(`Call ${callId} cancelled by user ${userId}`);
        return cancelled;
    }

    async forceEndUserCalls(userId) {
        const updatedCalls = await prisma.call.updateMany({
            where: {
                OR: [
                    { userId, status: { in: ['PENDING', 'ACTIVE'] } },
                    { consultantId: userId, status: { in: ['PENDING', 'ACTIVE'] } }
                ]
            },
            data: {
                status: 'CANCELLED',
                endTime: new Date()
            }
        });

        log.info(`Force ended ${updatedCalls.count} calls for user ${userId}`);
        return updatedCalls;
    }


    async getPendingCalls(userId) {
        const pendingCalls = await prisma.call.findMany({
            where: {
                consultantId: userId,
                status: 'PENDING'
            },
            include: {
                user: { select: { id: true, name: true, email: true, avatar: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        return pendingCalls;
    }

    async getUserCallHistory(userId, queryParams = {}) {
        const page = parseInt(queryParams.page) || 1;
        const limit = Math.min(parseInt(queryParams.limit) || 20, 100);
        const skip = (page - 1) * limit;

        const where = {
            OR: [
                { userId: userId },
                { consultantId: userId },
            ],
        };

        if (queryParams.status) where.status = queryParams.status;
        if (queryParams.callType) where.callType = queryParams.callType;

        const [calls, total] = await Promise.all([
            prisma.call.findMany({
                where,
                include: {
                    user: { select: { id: true, name: true, email: true, avatar: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma.call.count({ where }),
        ]);

        const callsWithDetails = await Promise.all(calls.map(async (call) => {
            const consultantUser = await prisma.user.findUnique({
                where: { id: call.consultantId },
                select: { id: true, name: true, email: true, avatar: true }
            });

            return {
                ...call,
                durationMinutes: call.durationSeconds ? Math.ceil(call.durationSeconds / 60) : 0,
                isIncoming: call.userId !== userId,
                totalCost: parseFloat(call.totalCost || 0),
                consultant: consultantUser
            };
        }));

        return {
            meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
            calls: callsWithDetails,
        };
    }
    async getCallById(callId, userId, userRole) {
        const call = await prisma.call.findUnique({
            where: { id: callId },
        });

        if (!call) {
            throw new NotFoundError('Call not found');
        }

        const [user, consultantUser] = await Promise.all([
            prisma.user.findUnique({ where: { id: call.userId }, select: { id: true, name: true, email: true, avatar: true } }),
            prisma.user.findUnique({ where: { id: call.consultantId }, select: { id: true, name: true, email: true, avatar: true } })
        ]);

        const isParticipant = call.userId === userId || call.consultantId === userId;
        if (!isParticipant && userRole !== 'ADMIN') {
            throw new ForbiddenError('You are not authorized to view this call');
        }

        return {
            ...call,
            user,
            consultant: consultantUser,
            durationMinutes: call.durationSeconds ? Math.ceil(call.durationSeconds / 60) : 0,
            totalCost: parseFloat(call.totalCost || 0),
        };
    }
}

export const callService = new CallService();
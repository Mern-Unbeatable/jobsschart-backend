
import { prisma } from '../../config/db.js';
import { Logger } from '../../config/logger.js';
import {
    NotFoundError,
    ConflictError,
    BadRequestError,
    ForbiddenError
} from '../../shared/globals/helpers/error-handler.js';
import { twilioService } from '../../shared/services/twilio.service.js';
import { emitIncomingCall, emitCallAccepted, emitCallRejected, emitCallEnded, prepareCallEnd } from '../../socket/index.js';
import { sessionService } from '../session/session.service.js';
const log = new Logger('CallService');

/** Prevent double-billing when two end-call requests arrive at once */
const endingCallLocks = new Set();

const CONSULTANT_SHARE_RATE = 0.5;
const PLATFORM_SHARE_RATE = 0.5;


class CallService {

    /** Resolve consultant record ID or user ID → consultant user ID */
    async _resolveConsultantUserId(consultantIdOrUserId) {
        const byUser = await prisma.user.findUnique({
            where: { id: consultantIdOrUserId },
            include: { consultant: { select: { id: true, isApproved: true } } },
        });
        if (byUser?.consultant) return byUser.id;

        const byRecord = await prisma.consultant.findUnique({
            where: { id: consultantIdOrUserId },
            select: { userId: true },
        });
        if (byRecord?.userId) return byRecord.userId;

        throw new NotFoundError('Consultant not found');
    }

    _normalizeCallType(callType) {
        const type = String(callType || 'PHONE').toUpperCase();
        if (type === 'AUDIO') return 'PHONE';
        if (!['PHONE', 'VIDEO'].includes(type)) {
            throw new BadRequestError(`Invalid call type: ${callType}. Use PHONE or VIDEO.`);
        }
        return type;
    }

    /** Cancel abandoned PENDING/ACTIVE calls so users are not blocked */
    async _cleanupStaleCalls(userId, consultantUserId) {
        const pendingCutoff = new Date(Date.now() - 3 * 60 * 1000);
        const activeCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);

        const result = await prisma.call.updateMany({
            where: {
                OR: [
                    { userId, status: 'PENDING', createdAt: { lt: pendingCutoff } },
                    { consultantId: consultantUserId, status: 'PENDING', createdAt: { lt: pendingCutoff } },
                    { userId, status: 'ACTIVE', updatedAt: { lt: activeCutoff } },
                    { consultantId: consultantUserId, status: 'ACTIVE', updatedAt: { lt: activeCutoff } },
                ],
            },
            data: { status: 'CANCELLED', endTime: new Date() },
        });

        if (result.count > 0) {
            log.info(`Cleaned up ${result.count} stale call(s) for user ${userId}`);
        }
    }

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



    async initiateCall(userId, consultantIdOrUserId, callType) {
        const callTypeNorm = this._normalizeCallType(callType);
        const consultantUserId = await this._resolveConsultantUserId(consultantIdOrUserId);

        await this._cleanupStaleCalls(userId, consultantUserId);
        await this.checkUserBalance(userId, consultantUserId);

        if (!twilioService.isConfigured()) {
            throw new BadRequestError(
                'Voice and video calling is not available yet. Twilio credentials are missing on the server.'
            );
        }

        const consultantUser = await prisma.user.findUnique({
            where: { id: consultantUserId },
            include: { consultant: true },
        });

        if (!consultantUser?.consultant) {
            throw new NotFoundError('Consultant not found');
        }

        const consultant = consultantUser.consultant;

        if (!consultant.isApproved) {
            throw new ForbiddenError('Consultant is not approved yet');
        }

        if (consultant.onlineStatus !== 'ONLINE') {
            throw new BadRequestError('Consultant is not online');
        }

        const activeCall = await prisma.call.findFirst({
            where: {
                OR: [
                    { userId, status: { in: ['PENDING', 'ACTIVE'] } },
                    { consultantId: consultantUserId, status: { in: ['PENDING', 'ACTIVE'] } },
                ],
            },
            orderBy: { createdAt: 'desc' },
        });

        if (activeCall) {
            const ageMs = Date.now() - new Date(activeCall.createdAt).getTime();
            // Auto-cancel very recent duplicate PENDING from a failed initiate (orphaned record)
            if (activeCall.status === 'PENDING' && ageMs < 60 * 1000) {
                await prisma.call.update({
                    where: { id: activeCall.id },
                    data: { status: 'CANCELLED', endTime: new Date() },
                });
                log.warn(`Auto-cancelled orphaned pending call ${activeCall.id}`);
            } else {
                throw new ConflictError(
                    'You already have an active call. Please end or cancel it before starting a new one.'
                );
            }
        }

        const roomName = `call_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, name: true, email: true, avatar: true },
        });

        let call = null;
        try {
            call = await prisma.call.create({
                data: {
                    userId,
                    consultantId: consultantUserId,
                    callType: callTypeNorm,
                    status: 'PENDING',
                    roomUrl: roomName,
                },
                include: {
                    user: { select: { id: true, name: true, email: true, avatar: true } },
                },
            });

            await twilioService.ensureRoom(roomName, call.id);

            const userToken = twilioService.generateAccessToken(
                userId,
                user.name || user.email,
                roomName,
                callTypeNorm
            );

            const consultantToken = twilioService.generateAccessToken(
                consultantUserId,
                consultantUser.name || consultantUser.email,
                roomName,
                callTypeNorm
            );

            emitIncomingCall(consultantUserId, {
                callId: call.id,
                callerId: userId,
                callerName: user.name,
                callerEmail: user.email,
                callerAvatar: user.avatar,
                callType: callTypeNorm,
                roomName,
                token: consultantToken,
                timestamp: new Date().toISOString(),
            });

            log.info(`Call initiated: ${call.id} - ${callTypeNorm} between ${userId} and ${consultantUserId}`);

            return {
                call: {
                    id: call.id,
                    roomName,
                    status: call.status.toLowerCase(),
                    callType: call.callType,
                    startTime: null,
                },
                tokens: {
                    user: { token: userToken, identity: user.name || user.email },
                    consultant: { token: consultantToken, identity: consultantUser.name || consultantUser.email },
                },
            };
        } catch (error) {
            if (call?.id) {
                await prisma.call.update({
                    where: { id: call.id },
                    data: { status: 'CANCELLED', endTime: new Date() },
                }).catch(() => {});
                log.warn(`Rolled back failed call ${call.id}`);
            }

            if (error instanceof BadRequestError
                || error instanceof NotFoundError
                || error instanceof ForbiddenError
                || error instanceof ConflictError) {
                throw error;
            }

            log.error(`initiateCall failed: ${error.message}`, { stack: error.stack });
            throw new BadRequestError(`Could not start call: ${error.message}`);
        }
    }


    _buildLowBalanceWarning(remainingMinutes, remainingBalance) {
        if (remainingMinutes <= 1) {
            return { type: 'critical', remainingMinutes, remainingBalance };
        }
        if (remainingMinutes <= 5) {
            return { type: 'five_minutes', remainingMinutes, remainingBalance };
        }
        if (remainingMinutes <= 10) {
            return { type: 'ten_minutes', remainingMinutes, remainingBalance };
        }
        return null;
    }

    /** Monitor balance during active call — warnings + auto-end trigger */
    async monitorCallBalance(callId, warningState = {}) {
        const call = await prisma.call.findUnique({
            where: { id: callId },
            include: {
                user: { include: { wallet: true } },
                consultant: { include: { consultant: true } },
                billing: true,
            },
        });

        if (!call || call.status !== 'ACTIVE' || !call.startTime) {
            return { shouldEnd: false, warning: null, warningState };
        }

        const ratePerMinute = Number(call.consultant?.consultant?.pricePerMinute || 2.5);
        const ratePerSecond = ratePerMinute / 60;
        const balance = Number(call.user?.wallet?.creditBalance || 0);
        const elapsedSeconds = Math.max(0, (Date.now() - new Date(call.startTime).getTime()) / 1000);
        const accruedTotal = elapsedSeconds * ratePerSecond;
        const alreadyBilled = parseFloat(call.totalCost || 0);
        const unbilledAccrual = Math.max(0, accruedTotal - alreadyBilled);
        const remainingAffordable = balance - unbilledAccrual;
        const remainingMinutes = Math.max(0, Math.floor(remainingAffordable / ratePerMinute));

        let warning = null;
        const nextState = { ...warningState };

        if (remainingMinutes <= 10 && !nextState.ten) {
            warning = { type: 'ten_minutes', remainingMinutes, remainingBalance: Number(remainingAffordable.toFixed(2)) };
            nextState.ten = true;
        } else if (remainingMinutes <= 5 && !nextState.five) {
            warning = { type: 'five_minutes', remainingMinutes, remainingBalance: Number(remainingAffordable.toFixed(2)) };
            nextState.five = true;
        } else if (remainingMinutes <= 1) {
            warning = { type: 'critical', remainingMinutes, remainingBalance: Number(remainingAffordable.toFixed(2)) };
        }

        const shouldEnd = remainingAffordable <= 0.05 || balance <= 0;

        return { shouldEnd, warning, warningState: nextState, userId: call.userId, consultantId: call.consultantId };
    }

    /** Bill one completed minute during an active call */
    async billCallMinute(callId) {
        const call = await prisma.call.findUnique({
            where: { id: callId },
            include: {
                user: { include: { wallet: true } },
                consultant: { include: { consultant: true } },
                billing: true,
            },
        });

        if (!call || call.status !== 'ACTIVE') return null;

        const consultantProfile = call.consultant?.consultant;
        if (!consultantProfile) return null;

        const ratePerMinute = Number(consultantProfile.pricePerMinute || 2.5);
        const wallet = call.user?.wallet;
        const balanceBefore = Number(wallet?.creditBalance || 0);

        if (balanceBefore < ratePerMinute) {
            return { ended: true, reason: 'insufficient_balance', callId, userId: call.userId };
        }

        const minuteNumber = (call.billing?.length || 0) + 1;
        const balanceAfter = Number((balanceBefore - ratePerMinute).toFixed(2));

        await prisma.$transaction(async (tx) => {
            await tx.wallet.update({
                where: { userId: call.userId },
                data: { creditBalance: balanceAfter },
            });

            await tx.creditTransaction.create({
                data: {
                    userId: call.userId,
                    transactionType: 'CALL_DEDUCTION',
                    amount: -ratePerMinute,
                    callId: call.id,
                    description: `${call.callType} call - minute ${minuteNumber} · €${ratePerMinute}/min`,
                    balanceBefore,
                    balanceAfter,
                },
            });

            await tx.callBilling.create({
                data: {
                    callId: call.id,
                    minuteNumber,
                    creditsDeducted: ratePerMinute,
                },
            });

            await tx.call.update({
                where: { id: callId },
                data: { totalCost: { increment: ratePerMinute } },
            });
        });

        const remainingMinutes = Math.floor(balanceAfter / ratePerMinute);
        const lowBalanceWarning = this._buildLowBalanceWarning(remainingMinutes, balanceAfter);

        return {
            billed: true,
            minuteNumber,
            amountCharged: ratePerMinute,
            balanceAfter,
            lowBalanceWarning,
            callId,
            userId: call.userId,
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
            callType: call.callType,
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
            startTime = new Date();
            await prisma.call.update({
                where: { id: callId },
                data: { status: 'ACTIVE', startTime },
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

    async endCall(callId, userId, endTimestamp = Date.now(), reason = 'user_ended') {
        if (endingCallLocks.has(callId)) {
            let attempts = 0;
            while (endingCallLocks.has(callId) && attempts < 30) {
                await new Promise((r) => setTimeout(r, 100));
                attempts++;
            }
            const ended = await prisma.call.findUnique({ where: { id: callId } });
            if (!ended) throw new NotFoundError('Call not found');
            if (ended.status === 'COMPLETED' || ended.status === 'CANCELLED') {
                return {
                    id: ended.id,
                    durationSeconds: ended.durationSeconds || 0,
                    totalCost: parseFloat(ended.totalCost || 0),
                    status: ended.status,
                    session: null,
                };
            }
        }

        endingCallLocks.add(callId);
        try {
            return await this._finalizeEndCall(callId, userId, endTimestamp, reason);
        } finally {
            endingCallLocks.delete(callId);
        }
    }

    async _finalizeEndCall(callId, userId, endTimestamp, reason = 'user_ended') {
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

        // ── ACTIVE call: bill remaining seconds only (minutes already billed live) ──
        const endTime = new Date(endTimestamp);
        const startTime = new Date(call.startTime);

        let durationSeconds = Math.floor(
            (endTime.getTime() - startTime.getTime()) / 1000
        );
        const finalDurationSeconds = Math.max(1, Math.min(durationSeconds, 86400));

        const consultantProfile = call.consultant?.consultant;
        if (!consultantProfile) {
            throw new NotFoundError('Consultant profile not found');
        }

        const ratePerMinute = Number(consultantProfile.pricePerMinute || 2.5);
        const ratePerSecond = ratePerMinute / 60;

        const alreadyBilledCost = parseFloat(call.totalCost || 0);
        const fullCost = Number((finalDurationSeconds * ratePerSecond).toFixed(2));
        let remainderCost = Number(Math.max(0, fullCost - alreadyBilledCost).toFixed(2));

        let session = null;
        let totalCost = alreadyBilledCost;
        let consultantShare = 0;
        let platformShare = 0;

        await prisma.$transaction(async (tx) => {
            const wallet = await tx.wallet.findUnique({
                where: { userId: call.userId },
            });

            if (!wallet) {
                throw new NotFoundError('Wallet not found');
            }

            const balanceBefore = Math.max(0, Number(wallet.creditBalance));
            // Never deduct more than available balance
            const actualRemainder = Number(Math.min(remainderCost, balanceBefore).toFixed(2));
            const balanceAfter = Number(Math.max(0, balanceBefore - actualRemainder).toFixed(2));
            totalCost = Number((alreadyBilledCost + actualRemainder).toFixed(2));
            consultantShare = Number((totalCost * CONSULTANT_SHARE_RATE).toFixed(2));
            platformShare = Number((totalCost - consultantShare).toFixed(2));

            if (actualRemainder > 0) {
                await tx.wallet.update({
                    where: { userId: call.userId },
                    data: { creditBalance: balanceAfter },
                });

                await tx.creditTransaction.create({
                    data: {
                        userId: call.userId,
                        transactionType: 'CALL_DEDUCTION',
                        amount: -actualRemainder,
                        callId: call.id,
                        description: `${call.callType} call - remaining ${finalDurationSeconds}s @ €${ratePerMinute}/min`,
                        balanceBefore,
                        balanceAfter,
                    },
                });

                const billedMinutes = await tx.callBilling.count({ where: { callId: call.id } });
                await tx.callBilling.create({
                    data: {
                        callId: call.id,
                        minuteNumber: billedMinutes + 1,
                        creditsDeducted: actualRemainder,
                    },
                });
            } else if (balanceBefore <= 0 && alreadyBilledCost <= 0) {
                // No charge possible
                totalCost = 0;
            }

            await tx.call.update({
                where: { id: callId },
                data: {
                    status: 'COMPLETED',
                    endTime,
                    durationSeconds: finalDurationSeconds,
                    totalCost,
                },
            });

            if (totalCost > 0) {
                const billedMinutes = Math.max(1, Math.ceil(finalDurationSeconds / 60));
                await tx.consultantEarning.create({
                    data: {
                        consultantId: consultantProfile.id,
                        callId: call.id,
                        minutes: billedMinutes,
                        grossAmount: totalCost,
                        consultantShare,
                        platformShare,
                        isPaidOut: false,
                    },
                }).catch((e) => {
                    log.warn(`ConsultantEarning skipped for call ${callId}: ${e.message}`);
                });
            }
        });

        remainderCost = totalCost - alreadyBilledCost;

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

        if (call.telecomCallId || call.roomUrl) {
            await twilioService.endRoom(call.telecomCallId || call.roomUrl);
        }

        const otherParticipantId = isUser ? call.consultantId : call.userId;

        // Emit to OTHER participant
        emitCallEnded(otherParticipantId, {
            callId: call.id,
            endedBy: userId,
            durationSeconds: finalDurationSeconds,
            totalCost,
            serverStartTime: call.startTime ? new Date(call.startTime).toISOString() : null,
            sessionId: session?.id,
            reason,
        });

        emitCallEnded(userId, {
            callId: call.id,
            endedBy: userId,
            durationSeconds: finalDurationSeconds,
            totalCost,
            serverStartTime: call.startTime ? new Date(call.startTime).toISOString() : null,
            sessionId: session?.id,
            reason,
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
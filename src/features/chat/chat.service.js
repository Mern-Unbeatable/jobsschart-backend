
import { prisma } from '../../config/db.js';
import { Logger } from '../../config/logger.js';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../shared/globals/helpers/error-handler.js';
import nodemailer from 'nodemailer';
import { sessionService } from '../session/session.service.js';

const log = new Logger('ChatService');

const PRICE_PER_MINUTE = 2.50;
const CONSULTANT_SHARE_RATE = 0.5;
const PLATFORM_SHARE_RATE   = 0.5;

/** Prevent double-billing when two end requests arrive at once (no ENDING enum in DB) */
const endingSessionLocks = new Set();

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

class ChatService {

  async _resolveOtherUser(otherUserId) {
        let otherUser = await prisma.user.findUnique({
            where: { id: otherUserId },
            select: { id: true, name: true, avatar: true, role: true },
        });

        if (!otherUser) {
            const consultant = await prisma.consultant.findUnique({
                where: { id: otherUserId },
                include: { user: { select: { id: true, name: true, avatar: true, role: true } } },
            });
            if (consultant?.user) otherUser = consultant.user;
        }

        if (!otherUser) {
            const consultantByUser = await prisma.consultant.findUnique({
                where: { userId: otherUserId },
                include: { user: { select: { id: true, name: true, avatar: true, role: true } } },
            });
            if (consultantByUser?.user) otherUser = consultantByUser.user;
        }

        return otherUser;
    }

    _isPairConversation(conv, userId, otherUserId) {
        if (!conv?.participants || conv.participants.length !== 2) return false;
        const ids = new Set(conv.participants.map((p) => p.userId));
        return ids.size === 2 && ids.has(userId) && ids.has(otherUserId);
    }

    _pickPrimaryConversation(matches) {
        const rank = (c) => {
            const statusRank = c.sessionStatus === 'ACTIVE' ? 3 : c.sessionStatus === 'PENDING' ? 2 : 1;
            const msgCount = c._count?.messages ?? 0;
            const updated = new Date(c.updatedAt).getTime();
            return [statusRank, msgCount, updated];
        };
        return [...matches].sort((a, b) => {
            const ra = rank(a);
            const rb = rank(b);
            for (let i = 0; i < 3; i++) {
                if (rb[i] !== ra[i]) return rb[i] - ra[i];
            }
            return 0;
        })[0];
    }

    async _findConversationsBetween(userId, otherUserId, tx = prisma) {
        const candidates = await tx.chatConversation.findMany({
            where: {
                AND: [
                    { participants: { some: { userId } } },
                    { participants: { some: { userId: otherUserId } } },
                ],
            },
            include: {
                participants: true,
                _count: { select: { messages: true } },
            },
            orderBy: { updatedAt: 'desc' },
        });
        return candidates.filter((c) => this._isPairConversation(c, userId, otherUserId));
    }

    async _mergeConversations(primaryId, duplicateIds, tx = prisma) {
        const dupIds = duplicateIds.filter((id) => id && id !== primaryId);
        if (!dupIds.length) return;

        for (const dupId of dupIds) {
            await tx.chatMessage.updateMany({
                where: { conversationId: dupId },
                data: { conversationId: primaryId },
            });

            await tx.chatBilling.updateMany({
                where: { conversationId: dupId },
                data: { conversationId: primaryId },
            });

            const dupSession = await tx.session.findUnique({ where: { chatConversationId: dupId } });
            const primarySession = await tx.session.findUnique({ where: { chatConversationId: primaryId } });
            if (dupSession && !primarySession) {
                await tx.session.update({
                    where: { id: dupSession.id },
                    data: { chatConversationId: primaryId },
                });
            } else if (dupSession && primarySession) {
                await tx.session.update({
                    where: { id: dupSession.id },
                    data: { chatConversationId: null },
                });
            }

            await tx.chatParticipant.deleteMany({ where: { conversationId: dupId } });
            await tx.chatConversation.delete({ where: { id: dupId } });
        }

        await tx.chatConversation.update({
            where: { id: primaryId },
            data: { updatedAt: new Date() },
        });

        log.info(`Merged ${dupIds.length} duplicate conversation(s) into ${primaryId}`);
    }

    async getOrCreateConversation(userId, otherUserId) {
        const otherUser = await this._resolveOtherUser(otherUserId);
        if (!otherUser) throw new NotFoundError('Chat recipient not found. Use the consultant user id, not the consultant profile id.');
        otherUserId = otherUser.id;

        const conversation = await prisma.$transaction(async (tx) => {
            const matches = await this._findConversationsBetween(userId, otherUserId, tx);

            if (matches.length > 0) {
                const primary = this._pickPrimaryConversation(matches);
                const duplicateIds = matches.filter((m) => m.id !== primary.id).map((m) => m.id);
                if (duplicateIds.length) {
                    await this._mergeConversations(primary.id, duplicateIds, tx);
                }
                return tx.chatConversation.findUnique({
                    where: { id: primary.id },
                    include: this._conversationInclude(userId),
                });
            }

            return tx.chatConversation.create({
                data: { participants: { create: [{ userId }, { userId: otherUserId }] } },
                include: this._conversationInclude(userId),
            });
        });

        return this._formatConversation(conversation, userId);
    }

    async getUserConversations(userId) {
        const conversations = await prisma.chatConversation.findMany({
            where: { participants: { some: { userId } } },
            include: {
                participants: { include: { user: { select: { id: true, name: true, avatar: true, role: true } } } },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    include: { sender: { select: { id: true, name: true, avatar: true } } },
                },
                _count: { select: { messages: true } },
            },
            orderBy: { updatedAt: 'desc' },
        });

        const groups = new Map();
        const orphans = [];

        for (const conv of conversations) {
            const otherParticipant = conv.participants.find((p) => p.userId !== userId);
            const otherId = otherParticipant?.userId;
            if (!otherId) {
                orphans.push(conv);
                continue;
            }
            if (!groups.has(otherId)) groups.set(otherId, []);
            groups.get(otherId).push(conv);
        }

        const kept = [];
        for (const [, group] of groups) {
            if (group.length > 1) {
                const primary = this._pickPrimaryConversation(group);
                const duplicateIds = group.filter((c) => c.id !== primary.id).map((c) => c.id);
                try {
                    await this._mergeConversations(primary.id, duplicateIds);
                } catch (err) {
                    log.warn(`Auto-merge failed: ${err.message}`);
                }
                kept.push(primary);
            } else {
                kept.push(group[0]);
            }
        }

        const all = [...kept, ...orphans].sort(
            (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
        );

        return Promise.all(all.map((c) => this._formatConversation(c, userId)));
    }

    async getMessages(conversationId, userId, page = 1, limit = 50) {
        const participant = await prisma.chatParticipant.findFirst({
            where: { conversationId, userId },
        });
        if (!participant) throw new ForbiddenError('Not a participant');

        const conv = await prisma.chatConversation.findUnique({
            where: { id: conversationId },
            select: { sessionStatus: true, endedAt: true },
        });
        if (!conv) throw new NotFoundError('Conversation not found');

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { role: true },
        });
        const isConsultant = user?.role === 'CONSULTANT' || user?.role === 'ADMIN';
        if (isConsultant && (conv.sessionStatus === 'ENDED' || conv.endedAt)) {
            throw new ForbiddenError('Consultants cannot access chat history after a session has ended');
        }

        const skip = (page - 1) * limit;
        const [messages, total] = await Promise.all([
            prisma.chatMessage.findMany({
                where: { conversationId },
                include: { sender: { select: { id: true, name: true, avatar: true, role: true } } },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma.chatMessage.count({ where: { conversationId } }),
        ]);

        return {
            messages: messages.reverse(),
            meta: { page, limit, total, totalPages: Math.ceil(total / limit), hasMore: skip + limit < total },
        };
    }

    async sendMessage(conversationId, senderId, message) {
        const participant = await prisma.chatParticipant.findFirst({
            where: { conversationId, userId: senderId },
        });
        if (!participant) throw new ForbiddenError('Not a participant');

        const conv = await prisma.chatConversation.findUnique({
            where: { id: conversationId },
            select: { sessionStatus: true, billingUserId: true },
        });

        if (conv?.sessionStatus !== 'ACTIVE') {
            const senderUser = await prisma.user.findUnique({
                where: { id: senderId },
                select: { role: true },
            });
            const isConsultant = senderUser?.role === 'CONSULTANT' || senderUser?.role === 'ADMIN';
            if (conv?.sessionStatus === 'PENDING' && !isConsultant) {
                // Allow customer to send while waiting for consultant acceptance
            } else {
                throw new BadRequestError(
                    conv?.sessionStatus === 'PENDING'
                        ? 'Please accept the chat request before replying.'
                        : 'No active session. Please start a paid session to send messages.'
                );
            }
        }

        const senderUser = await prisma.user.findUnique({
            where: { id: senderId },
            select: { role: true },
        });
        const isConsultant = senderUser?.role === 'CONSULTANT' || senderUser?.role === 'ADMIN';

        if (!isConsultant) {
            const wallet = await prisma.wallet.findUnique({ where: { userId: senderId } });
            if (!wallet || parseFloat(wallet.creditBalance) < 0.10) {
                throw new BadRequestError(`Insufficient balance. Current: €${parseFloat(wallet?.creditBalance || 0).toFixed(2)}`);
            }
        }

        const newMessage = await prisma.chatMessage.create({
            data: { conversationId, senderId, message, isRead: false },
            include: { sender: { select: { id: true, name: true, avatar: true, role: true } } },
        });

        await prisma.chatConversation.update({
            where: { id: conversationId },
            data: { updatedAt: new Date() },
        });

        try {
            const { broadcastNewMessage } = await import('../../socket/index.js');
            await broadcastNewMessage(conversationId, newMessage, senderId);
        } catch (socketErr) {
            log.warn(`Socket broadcast skipped: ${socketErr.message}`);
        }

        return newMessage;
    }

    // ── Session ───────────────────────────────────────────────────

    async startSession(conversationId, initiatorId, sessionType = 'CHAT') {
        const conv = await prisma.chatConversation.findUnique({
            where: { id: conversationId },
            include: {
                participants: {
                    include: { user: { select: { id: true, role: true, email: true, name: true } } },
                },
            },
        });
        if (!conv) throw new NotFoundError('Conversation not found');
        if (conv.sessionStatus === 'ACTIVE') throw new BadRequestError('Session already active');
        if (conv.sessionStatus === 'PENDING') throw new BadRequestError('Chat request already pending consultant acceptance');

        const userParticipant = conv.participants.find(p => p.user.role === 'USER');
        const consultantParticipant = conv.participants.find(p => p.user.role !== 'USER');

        if (!userParticipant) throw new BadRequestError('No user participant found for billing');
        if (!consultantParticipant) throw new BadRequestError('No consultant found');

        const billingUserId = userParticipant.userId;

        const wallet = await prisma.wallet.findUnique({ where: { userId: billingUserId } });
        if (!wallet || parseFloat(wallet.creditBalance) < PRICE_PER_MINUTE) {
            throw new BadRequestError(
                `Insufficient balance. Minimum €${PRICE_PER_MINUTE} required. Current: €${parseFloat(wallet?.creditBalance || 0).toFixed(2)}`
            );
        }

        const updated = await prisma.chatConversation.update({
            where: { id: conversationId },
            data: {
                sessionType,
                sessionStatus: 'PENDING',
                billingUserId,
                startedAt: null,
                endedAt: null,
                totalMinutes: 0,
                totalCost: 0,
            },
        });

        await this._postSystemMessage(
            conversationId,
            billingUserId,
            `Chat request sent · Waiting for consultant to accept · Rate: €${PRICE_PER_MINUTE}/min`
        );

        return {
            ...updated,
            consultantUserId: consultantParticipant.userId,
            customerName: userParticipant.user.name,
            customerId: userParticipant.userId,
        };
    }

    async acceptSession(conversationId, consultantUserId) {
        const conv = await prisma.chatConversation.findUnique({
            where: { id: conversationId },
            include: {
                participants: {
                    include: { user: { select: { id: true, role: true, name: true } } },
                },
            },
        });
        if (!conv) throw new NotFoundError('Conversation not found');
        if (conv.sessionStatus !== 'PENDING') throw new BadRequestError('No pending chat request to accept');

        const consultantParticipant = conv.participants.find(p => p.userId === consultantUserId);
        if (!consultantParticipant) throw new ForbiddenError('Only the consultant can accept this chat request');

        const updated = await prisma.chatConversation.update({
            where: { id: conversationId },
            data: {
                sessionStatus: 'ACTIVE',
                startedAt: new Date(),
            },
        });

        await this._postSystemMessage(
            conversationId,
            consultantUserId,
            `${conv.sessionType} session accepted · Billing started · €${PRICE_PER_MINUTE}/min`
        );

        return updated;
    }

    async declineSession(conversationId, consultantUserId) {
        const conv = await prisma.chatConversation.findUnique({
            where: { id: conversationId },
            include: { participants: true },
        });
        if (!conv) throw new NotFoundError('Conversation not found');
        if (conv.sessionStatus !== 'PENDING') throw new BadRequestError('No pending chat request to decline');

        const consultantParticipant = conv.participants.find(p => p.userId === consultantUserId);
        if (!consultantParticipant) throw new ForbiddenError('Only the consultant can decline this chat request');

        const updated = await prisma.chatConversation.update({
            where: { id: conversationId },
            data: {
                sessionStatus: 'IDLE',
                billingUserId: null,
                startedAt: null,
                endedAt: null,
                totalMinutes: 0,
                totalCost: 0,
            },
        });

        await this._postSystemMessage(
            conversationId,
            consultantUserId,
            'Chat request declined by consultant'
        );

        try {
            const { getIO } = await import('../../socket/index.js');
            const io = getIO();
            for (const p of conv.participants) {
                io.to(`user_${p.userId}`).emit('chat_request_declined', { conversationId });
            }
        } catch (socketErr) {
            log.warn(`chat_request_declined emit skipped: ${socketErr.message}`);
        }

        return updated;
    }

    async emailTranscript(conversationId, userId) {
        const participant = await prisma.chatParticipant.findFirst({
            where: { conversationId, userId },
        });
        if (!participant) throw new ForbiddenError('Not a participant');

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { role: true, email: true },
        });
        if (user?.role !== 'USER') {
            throw new ForbiddenError('Only customers can request chat transcripts');
        }

        const conv = await prisma.chatConversation.findUnique({
            where: { id: conversationId },
            include: {
                participants: {
                    include: { user: { select: { id: true, name: true, email: true, role: true } } },
                },
            },
        });
        if (!conv) throw new NotFoundError('Conversation not found');

        const totalMinutes = parseFloat(conv.totalMinutes || 0);
        const totalCost = parseFloat(conv.totalCost || 0);
        await this._sendTranscriptEmail(conv, totalMinutes, totalCost);

        return { sent: true, email: user.email };
    }

    // ─────────────────────────────────────────────────────────────
    // ✅ billOneMinute — called by billing timer every completed minute
    // ─────────────────────────────────────────────────────────────
    async billOneMinute(conversationId, { skipAutoEnd = false } = {}) {
        log.info(`💰 billOneMinute: ${conversationId}`);

        const conv = await prisma.chatConversation.findUnique({
            where: { id: conversationId },
            include: {
                participants: { include: { user: { select: { id: true, role: true } } } },
            },
        });

        if (!conv || conv.sessionStatus !== 'ACTIVE') return null;

        const billingUserId = conv.billingUserId;
        if (!billingUserId) return null;

        const consultantParticipant = conv.participants.find(p => p.user.role !== 'USER');
        const consultantUserId = consultantParticipant?.userId;

        const currentTotalMinutes = parseFloat(conv.totalMinutes || 0);
        const nextMinuteNumber = currentTotalMinutes + 1;

        // Balance check
        const wallet = await prisma.wallet.findUnique({ where: { userId: billingUserId } });
        if (!wallet || parseFloat(wallet.creditBalance) < PRICE_PER_MINUTE) {
            log.warn(`Insufficient balance for user: ${billingUserId}`);

            if (skipAutoEnd) {
                return {
                    ended: true,
                    reason: 'insufficient_balance',
                    totalMinutes: currentTotalMinutes,
                    totalCost: parseFloat(conv.totalCost || 0),
                    sessionType: conv.sessionType,
                };
            }

            const result = await this.endSession(conversationId, 'insufficient_balance');
            const finalConv = await prisma.chatConversation.findUnique({
                where: { id: conversationId },
                select: { totalMinutes: true, totalCost: true, sessionType: true },
            });

            return {
                ended: true,
                reason: 'insufficient_balance',
                totalMinutes: parseFloat(finalConv?.totalMinutes || currentTotalMinutes),
                totalCost: parseFloat(finalConv?.totalCost || 0),
                sessionType: finalConv?.sessionType || conv.sessionType,
                sessionId: result?.sessionId || null,
            };
        }

        const balanceBefore = parseFloat(wallet.creditBalance);
        const balanceAfter = Number((balanceBefore - PRICE_PER_MINUTE).toFixed(2));
        const consultantShare = Number((PRICE_PER_MINUTE * CONSULTANT_SHARE_RATE).toFixed(2));
        const platformShare = Number((PRICE_PER_MINUTE * PLATFORM_SHARE_RATE).toFixed(2));

        log.info(`⏰ Billing minute #${nextMinuteNumber} for conv ${conversationId}`);

        try {
            await prisma.$transaction(async (tx) => {
                await tx.wallet.update({
                    where: { userId: billingUserId },
                    data: { creditBalance: balanceAfter },
                });

                await tx.creditTransaction.create({
                    data: {
                        userId: billingUserId,
                        transactionType: 'CALL_DEDUCTION',
                        amount: -PRICE_PER_MINUTE,
                        description: `${conv.sessionType} session - minute ${nextMinuteNumber} · €${PRICE_PER_MINUTE}/min`,
                        balanceBefore,
                        balanceAfter,
                    },
                });

                if (consultantUserId) {
                    await tx.chatBilling.create({
                        data: {
                            conversationId,
                            userId: billingUserId,
                            consultantId: consultantUserId,
                            sessionType: conv.sessionType,
                            minuteNumber: nextMinuteNumber,
                            amountCharged: PRICE_PER_MINUTE,
                            balanceBefore,
                            balanceAfter,
                        },
                    });

                    const consultantRecord = await tx.consultant.findUnique({
                        where: { userId: consultantUserId },
                    });
                    if (consultantRecord) {
                        await tx.consultantEarning.create({
                            data: {
                                consultantId: consultantRecord.id,
                                callId: `chat_${conversationId}_m${nextMinuteNumber}_${Date.now()}`,
                                minutes: 1,
                                grossAmount: PRICE_PER_MINUTE,
                                consultantShare,
                                platformShare,
                                isPaidOut: false,
                            },
                        }).catch(e => log.warn(`ConsultantEarning skipped: ${e.message}`));
                    }
                }

                await tx.chatConversation.update({
                    where: { id: conversationId },
                    data: {
                        totalMinutes: { increment: 1 },
                        totalCost: { increment: PRICE_PER_MINUTE },
                    },
                });
            });

            log.info(`✅ Minute #${nextMinuteNumber} billed | conv: ${conversationId}`);

            const remainingMinutes = Math.floor(balanceAfter / PRICE_PER_MINUTE);
            let lowBalanceWarning = null;
            if (remainingMinutes <= 1) {
                lowBalanceWarning = { type: 'critical', remainingMinutes, remainingBalance: balanceAfter };
            } else if (remainingMinutes <= 5) {
                lowBalanceWarning = { type: 'five_minutes', remainingMinutes, remainingBalance: balanceAfter };
            } else if (remainingMinutes <= 10) {
                lowBalanceWarning = { type: 'ten_minutes', remainingMinutes, remainingBalance: balanceAfter };
            }

            return {
                billed: true,
                minuteNumber: nextMinuteNumber,
                amountCharged: PRICE_PER_MINUTE,
                balanceAfter,
                consultantShare,
                platformShare,
                lowBalanceWarning,
                sessionType: conv.sessionType,
            };

        } catch (error) {
            log.error(`billOneMinute error: ${error.message}`);
            throw error;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // ✅ NEW: Bill remaining seconds proportionally (no Math.ceil!)
    // Called ONLY from endSession — NOT from the billing timer
    // ─────────────────────────────────────────────────────────────
    async _billRemainingSeconds(conversationId, conv, remainingSeconds) {
        const billingUserId = conv.billingUserId;
        const consultantParticipant = conv.participants?.find(p => p.user.role !== 'USER');
        const consultantUserId = consultantParticipant?.userId;

        const partialMinutes = Number((remainingSeconds / 60).toFixed(6));
        const partialCost = Number((partialMinutes * PRICE_PER_MINUTE).toFixed(2));

        if (partialCost < 0.01) {
            log.info(`Partial cost too small (${partialCost}), skipping`);
            return { billed: false, partialCost: 0 };
        }

        const consultantShare = Number((partialCost * CONSULTANT_SHARE_RATE).toFixed(2));
        const platformShare = Number((partialCost - consultantShare).toFixed(2));

        log.info(`💰 Billing remaining ${remainingSeconds}s (${partialMinutes.toFixed(4)} min) = €${partialCost} for conv ${conversationId}`);

        const wallet = await prisma.wallet.findUnique({ where: { userId: billingUserId } });
        if (!wallet || parseFloat(wallet.creditBalance) <= 0) {
            log.warn(`No balance for partial billing. Skipping.`);
            return { billed: false, partialCost: 0 };
        }

        const balanceBefore = parseFloat(wallet.creditBalance);
        // Don't let balance go negative
        const actualCost = Math.min(partialCost, balanceBefore);
        const actualMinutes = Number((actualCost / PRICE_PER_MINUTE).toFixed(6));
        const actualConsultantShare = Number((actualCost * CONSULTANT_SHARE_RATE).toFixed(2));
        const actualPlatformShare = Number((actualCost - actualConsultantShare).toFixed(2));
        const balanceAfter = Number((balanceBefore - actualCost).toFixed(2));

        try {
            await prisma.$transaction(async (tx) => {
                await tx.wallet.update({
                    where: { userId: billingUserId },
                    data: { creditBalance: balanceAfter },
                });

                await tx.creditTransaction.create({
                    data: {
                        userId: billingUserId,
                        transactionType: 'CALL_DEDUCTION',
                        amount: -actualCost,
                        description: `${conv.sessionType} session - remaining ${Math.round(remainingSeconds)}s · €${actualCost.toFixed(2)}`,
                        balanceBefore,
                        balanceAfter,
                    },
                });

                if (consultantUserId) {
                    await tx.chatBilling.create({
                        data: {
                            conversationId,
                            userId: billingUserId,
                            consultantId: consultantUserId,
                            sessionType: conv.sessionType,
                            minuteNumber: Math.ceil(parseFloat(conv.totalMinutes || 0)) + 1,
                            amountCharged: actualCost,
                            balanceBefore,
                            balanceAfter,
                        },
                    });

                    const consultantRecord = await tx.consultant.findUnique({
                        where: { userId: consultantUserId },
                    });
                    if (consultantRecord) {
                        await tx.consultantEarning.create({
                            data: {
                                consultantId: consultantRecord.id,
                                callId: `chat_${conversationId}_rem_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                                minutes: Math.max(1, Math.ceil(partialMinutes)),
                                grossAmount: actualCost,
                                consultantShare: actualConsultantShare,
                                platformShare: actualPlatformShare,
                                isPaidOut: false,
                            },
                        }).catch(e => log.warn(`ConsultantEarning partial skipped: ${e.message}`));
                    }
                }

                await tx.chatConversation.update({
                    where: { id: conversationId },
                    data: {
                        totalMinutes: { increment: actualMinutes },
                        totalCost: { increment: actualCost },
                    },
                });
            });

            log.info(`✅ Remaining ${remainingSeconds}s billed: €${actualCost} | conv: ${conversationId}`);

            return {
                billed: true,
                partialCost: actualCost,
                partialMinutes: actualMinutes,
                balanceAfter,
                remainingSeconds,
            };
        } catch (error) {
            log.error(`_billRemainingSeconds error: ${error.message}`);
            return { billed: false, partialCost: 0 };
        }
    }

    // ─────────────────────────────────────────────────────────────
    // ✅ FIXED: endSession — bills remaining seconds PROPORTIONALLY
    // No more Math.ceil rounding up to full minutes!
    // ─────────────────────────────────────────────────────────────
    async endSession(conversationId, reason = 'ended', endTimestamp = Date.now()) {
        log.info(`🔚 endSession: ${conversationId}, reason: ${reason}`);

        // Another end request is already processing — wait and return final totals
        if (endingSessionLocks.has(conversationId)) {
            let attempts = 0;
            while (endingSessionLocks.has(conversationId) && attempts < 30) {
                await new Promise((r) => setTimeout(r, 100));
                attempts++;
            }
            const ended = await prisma.chatConversation.findUnique({
                where: { id: conversationId },
                select: {
                    sessionStatus: true, totalMinutes: true, totalCost: true,
                    sessionType: true, endedAt: true, startedAt: true,
                },
            });
            if (!ended) return null;
            const durationSeconds = ended.startedAt && ended.endedAt
                ? Math.max(0, Math.round((new Date(ended.endedAt).getTime() - new Date(ended.startedAt).getTime()) / 1000))
                : 0;
            return {
                totalMinutes: parseFloat(ended.totalMinutes || 0),
                totalCost: parseFloat(ended.totalCost || 0),
                durationSeconds,
                endedAt: ended.endedAt || new Date(),
                sessionId: null,
                sessionCreated: false,
                sessionType: ended.sessionType,
                reason,
                alreadyEnded: true,
            };
        }

        endingSessionLocks.add(conversationId);
        try {
            return await this._finalizeEndSession(conversationId, reason, endTimestamp);
        } finally {
            endingSessionLocks.delete(conversationId);
        }
    }

    async _finalizeEndSession(conversationId, reason, endTimestamp) {

        const conv = await prisma.chatConversation.findUnique({
            where: { id: conversationId },
            include: {
                participants: {
                    include: { user: { select: { id: true, name: true, email: true, role: true } } },
                },
            },
        });

        if (!conv) {
            log.warn(`Conversation not found: ${conversationId}`);
            return null;
        }

        // Already ended — return stored values
        if (conv.sessionStatus === 'ENDED' || conv.sessionStatus === 'IDLE') {
            log.info(`Session already ended/idle: ${conversationId}`);
            return {
                totalMinutes: parseFloat(conv.totalMinutes || 0),
                totalCost: parseFloat(conv.totalCost || 0),
                endedAt: conv.endedAt || new Date(),
                sessionId: null,
                sessionCreated: false,
                sessionType: conv.sessionType,
                reason,
                alreadyEnded: true,
            };
        }

        // Pending request ended without billing
        if (conv.sessionStatus === 'PENDING') {
            await prisma.chatConversation.update({
                where: { id: conversationId },
                data: { sessionStatus: 'IDLE', billingUserId: null, endedAt: new Date() },
            });
            return {
                totalMinutes: 0,
                totalCost: 0,
                endedAt: new Date(),
                sessionId: null,
                sessionCreated: false,
                sessionType: conv.sessionType,
                reason,
                alreadyEnded: false,
            };
        }

        const wasActive = conv.sessionStatus === 'ACTIVE';

        // ✅ Bill remaining seconds PROPORTIONALLY (not Math.ceil!)
        if (wasActive && conv.startedAt && conv.billingUserId) {
            const elapsedSeconds = (endTimestamp - new Date(conv.startedAt).getTime()) / 1000;
            const alreadyBilledMinutes = parseFloat(conv.totalMinutes || 0);
            const alreadyBilledSeconds = alreadyBilledMinutes * 60;
            // Remaining seconds = total elapsed - already billed
            // Use Math.ceil on seconds only to capture the partial second
            const remainingSeconds = Math.max(0, Math.ceil(elapsedSeconds) - alreadyBilledSeconds);

            log.info(
                `📊 End billing: elapsed=${Math.floor(elapsedSeconds)}s, ` +
                `alreadyBilled=${alreadyBilledMinutes}min (${alreadyBilledSeconds}s), ` +
                `remaining=${remainingSeconds}s`
            );

            if (remainingSeconds >= 1) {
                await this._billRemainingSeconds(conversationId, conv, remainingSeconds);
            }
        }

        // ✅ Re-fetch AFTER billing — these are the CORRECT totals
        const finalConv = await prisma.chatConversation.findUnique({
            where: { id: conversationId },
            select: { totalMinutes: true, totalCost: true, sessionType: true, startedAt: true, endedAt: true },
        });

        const totalMinutes = parseFloat(finalConv?.totalMinutes || 0);
        const totalCost = parseFloat(finalConv?.totalCost || 0);
        const sessionType = finalConv?.sessionType || conv.sessionType;

        // Calculate exact duration in seconds (frozen at end initiation — not when billing completes)
        const durationSeconds = conv.startedAt
            ? Math.max(0, Math.round((endTimestamp - new Date(conv.startedAt).getTime()) / 1000))
            : 0;

        log.info(`✅ Final totals: ${totalMinutes.toFixed(2)} min, €${totalCost.toFixed(2)}, ${durationSeconds}s`);

        // Set status to ENDED
        await prisma.chatConversation.update({
            where: { id: conversationId },
            data: { sessionStatus: 'ENDED', endedAt: new Date() },
        });

        const billingUserId = conv.billingUserId;

        // Create session record
        let session = null;
        if (totalMinutes > 0 && totalCost > 0 && billingUserId) {
            try {
                session = await sessionService.createFromChat(
                    conversationId,
                    billingUserId,
                    totalMinutes,
                    totalCost,
                    sessionType || 'CHAT',
                    durationSeconds  // ✅ Pass exact seconds
                );
                if (session) log.info(`✅ Session record created: ${session.id}`);
            } catch (sessionError) {
                log.error(`❌ Session record failed: ${sessionError.message}`);
            }
        } else {
            log.warn(`No session record — Minutes: ${totalMinutes}, Cost: ${totalCost}`);
        }

        // System message
        if (billingUserId) {
            const endMsg = reason === 'insufficient_balance'
                ? `Session ended: insufficient balance · ${totalMinutes.toFixed(2)} min · €${totalCost.toFixed(2)} total`
                : `Session ended · ${totalMinutes.toFixed(2)} min · €${totalCost.toFixed(2)} total`;
            await this._postSystemMessage(conversationId, billingUserId, endMsg);
        }

        // Transcript email (non-blocking)
        this._sendTranscriptEmail(conv, totalMinutes, totalCost).catch(e =>
            log.error(`Transcript email failed: ${e.message}`)
        );

        return {
            totalMinutes,
            totalCost,
            durationSeconds,
            endedAt: new Date(),
            sessionId: session?.id || null,
            sessionCreated: !!session,
            sessionType,
            reason,
            alreadyEnded: false,
        };
    }

    async getSessionStatus(conversationId, userId) {
        const participant = await prisma.chatParticipant.findFirst({
            where: { conversationId, userId },
        });
        if (!participant) throw new ForbiddenError('Not a participant');

        const conv = await prisma.chatConversation.findUnique({
            where: { id: conversationId },
            select: {
                sessionStatus: true, sessionType: true, startedAt: true,
                totalMinutes: true, totalCost: true, billingUserId: true,
            },
        });

        const existingSession = await prisma.session.findUnique({
            where: { chatConversationId: conversationId },
            select: { id: true, rating: true, review: true },
        });

        const wallet = conv?.billingUserId === userId
            ? await prisma.wallet.findUnique({ where: { userId }, select: { creditBalance: true } })
            : null;

        return {
            ...conv,
            walletBalance: wallet?.creditBalance || null,
            pricePerMinute: PRICE_PER_MINUTE,
            remainingMinutes: wallet ? Math.floor(parseFloat(wallet.creditBalance) / PRICE_PER_MINUTE) : null,
            existingSession: existingSession || null,
        };
    }

    // ── Transcript Email ──────────────────────────────────────────

    async _sendTranscriptEmail(conv, totalMinutes, totalCost) {
        try {
            const messages = await prisma.chatMessage.findMany({
                where: { conversationId: conv.id },
                include: { sender: { select: { name: true, role: true } } },
                orderBy: { createdAt: 'asc' },
            });

            const userParticipant = conv.participants?.find(p => p.user.role === 'USER');
            const consultantParticipant = conv.participants?.find(p => p.user.role !== 'USER');

            if (!userParticipant?.user?.email) return;

            const consultantName = consultantParticipant?.user?.name || 'Consultant';
            const userEmail = userParticipant.user.email;
            const sessionDate = conv.startedAt
                ? new Date(conv.startedAt).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                : new Date().toLocaleString();

            const messagesHtml = messages
                .filter(m => !m.isSystem && (m.message || m.fileUrl))
                .map(m => {
                    const isUser = m.sender.role === 'USER';
                    const time = new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    const align = isUser ? 'right' : 'left';
                    const bgColor = isUser ? '#6E35AE' : '#f0f0f0';
                    const txtColor = isUser ? '#ffffff' : '#333333';
                    const content = m.fileUrl
                        ? `<a href="${m.fileUrl}" style="color:${isUser ? '#e8d5ff' : '#6E35AE'}">📎 ${m.fileName || 'File'}</a>`
                        : m.message;
                    return `<tr><td style="padding:6px 0;text-align:${align};"><div style="display:inline-block;max-width:70%;background:${bgColor};color:${txtColor};padding:10px 14px;border-radius:12px;font-size:14px;line-height:1.5;"><strong style="display:block;font-size:11px;opacity:0.8;margin-bottom:4px;">${m.sender.name} · ${time}</strong>${content}</div></td></tr>`;
                }).join('');

            const consultantTotal = Number((totalMinutes * PRICE_PER_MINUTE * CONSULTANT_SHARE_RATE).toFixed(2));
            const platformTotal = Number((totalMinutes * PRICE_PER_MINUTE * PLATFORM_SHARE_RATE).toFixed(2));

            const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f8f8f8;font-family:Arial,sans-serif;"><table width="100%" style="padding:30px 0;"><tr><td align="center"><table width="600" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);"><tr><td style="background:linear-gradient(135deg,#6E35AE,#9B59B6);padding:30px;text-align:center;"><h1 style="color:#fff;margin:0;font-size:24px;">Session Transcript</h1><p style="color:#e8d5ff;margin:8px 0 0;font-size:14px;">${sessionDate}</p></td></tr><tr><td style="padding:24px 30px;background:#faf7ff;border-bottom:1px solid #eee;"><table width="100%"><tr><td style="text-align:center;padding:10px;"><p style="margin:0;font-size:12px;color:#999;">Consultant</p><p style="margin:4px 0 0;font-size:18px;font-weight:bold;color:#333;">${consultantName}</p></td><td style="text-align:center;padding:10px;"><p style="margin:0;font-size:12px;color:#999;">Duration</p><p style="margin:4px 0 0;font-size:18px;font-weight:bold;color:#333;">${totalMinutes.toFixed(2)} min</p></td><td style="text-align:center;padding:10px;"><p style="margin:0;font-size:12px;color:#999;">Total</p><p style="margin:4px 0 0;font-size:18px;font-weight:bold;color:#6E35AE;">€${parseFloat(totalCost).toFixed(2)}</p></td></tr></table></td></tr>${messagesHtml ? `<tr><td style="padding:24px 30px;"><p style="margin:0 0 16px;font-size:16px;font-weight:bold;color:#333;">Conversation</p><table width="100%">${messagesHtml}</table></td></tr>` : `<tr><td style="padding:40px;text-align:center;color:#999;">No messages</td></tr>`}<tr><td style="padding:20px 30px;background:#f8f8f8;text-align:center;border-top:1px solid #eee;"><p style="margin:0;font-size:12px;color:#999;">Rate: €${PRICE_PER_MINUTE}/min · Consultant: €${consultantTotal} (50%) · Platform: €${platformTotal} (50%)</p></td></tr></table></td></tr></table></body></html>`;

            await transporter.sendMail({
                from: `"Consultation Platform" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
                to: userEmail,
                subject: `Your Session Transcript — ${sessionDate}`,
                html,
            });

            log.info(`Transcript email sent to ${userEmail}`);
        } catch (err) {
            log.error(`Transcript email failed: ${err.message}`);
        }
    }

    // ── Utility ───────────────────────────────────────────────────

    async getConversationById(conversationId) {
        return prisma.chatConversation.findUnique({
            where: { id: conversationId },
            include: { participants: { include: { user: { select: { id: true, name: true, role: true } } } } },
        });
    }

    async markAllAsRead(conversationId, userId) {
        await prisma.chatMessage.updateMany({
            where: { conversationId, senderId: { not: userId }, isRead: false },
            data: { isRead: true, readAt: new Date() },
        });
        await prisma.chatParticipant.updateMany({
            where: { conversationId, userId },
            data: { lastReadAt: new Date() },
        });
    }

    async getUnreadCount(userId) {
        const conversations = await prisma.chatParticipant.findMany({
            where: { userId },
            select: { conversationId: true },
        });
        return prisma.chatMessage.count({
            where: {
                conversationId: { in: conversations.map(c => c.conversationId) },
                senderId: { not: userId },
                isRead: false,
            },
        });
    }

    _conversationInclude(userId) {
        return {
            participants: { include: { user: { select: { id: true, name: true, avatar: true, role: true } } } },
            messages: { orderBy: { createdAt: 'desc' }, take: 1, include: { sender: { select: { id: true, name: true, avatar: true } } } },
        };
    }

    async _formatConversation(conv, userId) {
        const unreadCount = await prisma.chatMessage.count({
            where: { conversationId: conv.id, senderId: { not: userId }, isRead: false },
        });
        const otherParticipant = conv.participants.find(p => p.userId !== userId);
        const lastMessage = conv.messages[0] || null;

        let otherUser = otherParticipant?.user || null;
        if (otherUser && (otherUser.role === 'CONSULTANT' || otherUser.role === 'ADMIN')) {
            const consultant = await prisma.consultant.findUnique({
                where: { userId: otherUser.id },
                select: { id: true },
            });
            if (consultant) {
                otherUser = { ...otherUser, consultantRecordId: consultant.id };
            }
        }

        return {
            id: conv.id,
            sessionType: conv.sessionType,
            sessionStatus: conv.sessionStatus,
            totalMinutes: conv.totalMinutes,
            totalCost: conv.totalCost,
            startedAt: conv.startedAt,
            otherUser,
            consultantRecordId: otherUser?.consultantRecordId || null,
            lastMessage,
            unreadCount,
            updatedAt: conv.updatedAt,
            createdAt: conv.createdAt,
        };
    }

    async _postSystemMessage(conversationId, senderId, text) {
        return prisma.chatMessage.create({
            data: { conversationId, senderId, message: text, isSystem: true },
        });
    }
}

export const chatService = new ChatService();
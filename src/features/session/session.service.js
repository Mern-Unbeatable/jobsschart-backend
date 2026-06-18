// src/features/session/session.service.js
import { prisma } from '../../config/db.js';
import { Logger } from '../../config/logger.js';

const log = new Logger('SessionService');

class SessionService {

    // ─────────────────────────────────────────────────────────────
    // AUTO-CREATE: Call শেষ হলে call.service.js এর endCall() এ
    // এই function টা call করো
    // ─────────────────────────────────────────────────────────────
    async createFromCall(call, { finalDurationSeconds, totalCost, consultantEarning, platformEarning, ratePerMinute }) {
        try {
            // Already exists check (double-call protection)
            const existing = await prisma.session.findUnique({
                where: { callId: call.id },
            });
            if (existing) {
                log.warn(`Session already exists for call ${call.id}`);
                return existing;
            }

            const durationMinutes = Number((finalDurationSeconds / 60).toFixed(2));

            const session = await prisma.session.create({
                data: {
                    type:              call.callType === 'PHONE' ? 'PHONE' : 'VIDEO',
                    status:            'COMPLETED',
                    userId:            call.userId,
                    consultantUserId:  call.consultantId,
                    startTime:         call.startTime,
                    endTime:           new Date(),
                    durationSeconds:   finalDurationSeconds,
                    durationMinutes,
                    totalCost,
                    consultantEarning,
                    platformEarning,
                    pricePerMinute:    ratePerMinute,
                    callId:            call.id,
                },
            });

            log.info(`✅ Session created from call ${call.id} → session ${session.id}`);
            return session;
        } catch (err) {
            log.error(`Failed to create session from call ${call.id}: ${err.message}`);
            return null;
        }
    }

async createFromChat(conversationId, billingUserId, totalMinutes, totalCost, sessionType) {
    log.info(`📝 Creating session from chat: ${conversationId}, minutes: ${totalMinutes}, cost: ${totalCost}`);
    
    try {
        // Already exists check
        const existing = await prisma.session.findUnique({
            where: { chatConversationId: conversationId },
        });
        
        if (existing) {
            log.warn(`Session already exists for chat ${conversationId}`);
            return existing;
        }

        // Get conversation with participants
        const conversation = await prisma.chatConversation.findUnique({
            where: { id: conversationId },
            include: {
                participants: {
                    include: {
                        user: { 
                            select: { 
                                id: true, 
                                role: true,
                                name: true,
                                email: true 
                            } 
                        }
                    }
                }
            }
        });

        if (!conversation) {
            log.error(`Conversation not found: ${conversationId}`);
            return null;
        }

        log.info(`Conversation found - Participants: ${conversation.participants.length}`);

        // Find user and consultant from participants
        const userParticipant = conversation.participants.find(p => p.user.role === 'USER');
        const consultantParticipant = conversation.participants.find(p => p.user.role !== 'USER');

        if (!userParticipant) {
            log.error(`No user participant found for chat ${conversationId}`);
            return null;
        }
        
        if (!consultantParticipant) {
            log.error(`No consultant participant found for chat ${conversationId}`);
            return null;
        }

        log.info(`User: ${userParticipant.user.id}, Consultant: ${consultantParticipant.user.id}`);

        // Get consultant profile for price
        const consultantUser = await prisma.user.findUnique({
            where: { id: consultantParticipant.userId },
            include: { consultant: true }
        });

        const pricePerMinute = consultantUser?.consultant?.pricePerMinute || 2.50;
        const consultantShare = Number((totalCost * 0.5).toFixed(2));
        const platformShare = Number((totalCost * 0.5).toFixed(2));
        const durationSeconds = Math.round(Number(totalMinutes || 0) * 60);

        // Map session type
        let mappedType = 'CHAT';
        if (sessionType === 'AUDIO') {
            mappedType = 'PHONE';
        } else if (sessionType === 'VIDEO') {
            mappedType = 'VIDEO';
        } else {
            mappedType = 'CHAT';
        }

        log.info(`Creating session with data: type=${mappedType}, userId=${userParticipant.userId}, consultantUserId=${consultantParticipant.userId}`);

        // Create session
        const session = await prisma.session.create({
            data: {
                type: mappedType,
                status: 'COMPLETED',
                userId: userParticipant.userId,
                consultantUserId: consultantParticipant.userId,
                startTime: conversation.startedAt || new Date(),
                endTime: conversation.endedAt || new Date(),
                durationSeconds: durationSeconds,
                durationMinutes: Number(totalMinutes || 0),
                totalCost: totalCost,
                consultantEarning: consultantShare,
                platformEarning: platformShare,
                pricePerMinute: pricePerMinute,
                chatConversationId: conversationId,
            },
        });

        log.info(`✅ Session created from chat ${conversationId} → session ${session.id}`);
        return session;
        
    } catch (err) {
        log.error(`Failed to create session from chat ${conversationId}: ${err.message}`);
        log.error(err.stack);
        return null;
    }
}

    // ─────────────────────────────────────────────────────────────
    // UPDATE REVIEW: Review দেওয়ার পর session এ rating/review save
    // ─────────────────────────────────────────────────────────────
    async updateSessionReview(callId, chatConversationId, { rating, review }) {
        try {
            if (callId) {
                await prisma.session.updateMany({
                    where: { callId },
                    data: { rating, review, reviewedAt: new Date() },
                });
            } else if (chatConversationId) {
                await prisma.session.updateMany({
                    where: { chatConversationId },
                    data: { rating, review, reviewedAt: new Date() },
                });
            }
        } catch (err) {
            log.error(`Failed to update session review: ${err.message}`);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // USER: নিজের sessions দেখবে
    // ─────────────────────────────────────────────────────────────
    async getUserSessions(userId, queryParams = {}) {
        const page   = Math.max(1, parseInt(queryParams.page)  || 1);
        const limit  = Math.min(parseInt(queryParams.limit)    || 10, 100);
        const skip   = (page - 1) * limit;
        const type   = queryParams.type;
        const status = queryParams.status;

        const where = { userId };
        if (type)   where.type   = type;
        if (status) where.status = status;

        const [sessions, total] = await Promise.all([
            prisma.session.findMany({
                where,
                include: {
                    consultant: {
                        select: { id: true, name: true, email: true, avatar: true },
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma.session.count({ where }),
        ]);

        const formatted = sessions.map(s => this._formatSession(s, 'user'));

        const allCompleted = await prisma.session.findMany({
            where: { userId, status: 'COMPLETED' },
            select: { totalCost: true, durationMinutes: true, type: true },
        });

        const summary = this._buildUserSummary(allCompleted);

        return {
            sessions: formatted,
            summary,
            meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
    }

    // ─────────────────────────────────────────────────────────────
    // CONSULTANT: নিজের sessions দেখবে
    // ─────────────────────────────────────────────────────────────
    async getConsultantSessions(consultantUserId, queryParams = {}) {
        const page   = Math.max(1, parseInt(queryParams.page)  || 1);
        const limit  = Math.min(parseInt(queryParams.limit)    || 10, 100);
        const skip   = (page - 1) * limit;
        const type   = queryParams.type;
        const status = queryParams.status;

        const where = { consultantUserId };
        if (type)   where.type   = type;
        if (status) where.status = status;

        const [sessions, total] = await Promise.all([
            prisma.session.findMany({
                where,
                include: {
                    user: {
                        select: { id: true, name: true, email: true, avatar: true },
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma.session.count({ where }),
        ]);

        const formatted = sessions.map(s => this._formatSession(s, 'consultant'));

        const allCompleted = await prisma.session.findMany({
            where: { consultantUserId, status: 'COMPLETED' },
            select: {
                consultantEarning: true,
                durationMinutes:   true,
                rating:            true,
                type:              true,
            },
        });

        const summary = this._buildConsultantSummary(allCompleted);

        return {
            sessions: formatted,
            summary,
            meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
    }

    // ─────────────────────────────────────────────────────────────
    // ADMIN: সব sessions দেখবে
    // ─────────────────────────────────────────────────────────────
    async getAllSessions(queryParams = {}) {
        const page         = Math.max(1, parseInt(queryParams.page)  || 1);
        const limit        = Math.min(parseInt(queryParams.limit)    || 20, 100);
        const skip         = (page - 1) * limit;
        const type         = queryParams.type;
        const status       = queryParams.status;
        const search       = queryParams.search;
        const consultantId = queryParams.consultantId;
        const clientId     = queryParams.clientId;

        const where = {};
        if (type)         where.type            = type;
        if (status)       where.status          = status;
        if (consultantId) where.consultantUserId = consultantId;
        if (clientId)     where.userId           = clientId;

        if (search) {
            where.OR = [
                { user:       { name: { contains: search, mode: 'insensitive' } } },
                { consultant: { name: { contains: search, mode: 'insensitive' } } },
            ];
        }

        const [sessions, total] = await Promise.all([
            prisma.session.findMany({
                where,
                include: {
                    user:       { select: { id: true, name: true, email: true, avatar: true } },
                    consultant: { select: { id: true, name: true, email: true, avatar: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma.session.count({ where }),
        ]);

        const formatted = sessions.map(s => this._formatSession(s, 'admin'));

        const allCompleted = await prisma.session.findMany({
            where: { ...where, status: 'COMPLETED' },
            select: {
                totalCost:          true,
                consultantEarning:  true,
                platformEarning:    true,
                durationMinutes:    true,
                type:               true,
            },
        });

        const summary = {
            totalSessions:     total,
            completedSessions: allCompleted.length,
            totalRevenue:      Number(allCompleted.reduce((s, x) => s + Number(x.totalCost),         0).toFixed(2)),
            consultantPaid:    Number(allCompleted.reduce((s, x) => s + Number(x.consultantEarning), 0).toFixed(2)),
            platformRevenue:   Number(allCompleted.reduce((s, x) => s + Number(x.platformEarning),   0).toFixed(2)),
            totalMinutes:      Number(allCompleted.reduce((s, x) => s + Number(x.durationMinutes),    0).toFixed(2)),
            byType: {
                PHONE: allCompleted.filter(s => s.type === 'PHONE').length,
                VIDEO: allCompleted.filter(s => s.type === 'VIDEO').length,
                CHAT:  allCompleted.filter(s => s.type === 'CHAT').length,
            },
        };

        return {
            sessions: formatted,
            summary,
            meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
    }

    // ─────────────────────────────────────────────────────────────
    // Single session detail
    // ─────────────────────────────────────────────────────────────
    async getSessionById(sessionId, requestingUserId, role) {
        const session = await prisma.session.findUnique({
            where: { id: sessionId },
            include: {
                user:       { select: { id: true, name: true, email: true, avatar: true } },
                consultant: { select: { id: true, name: true, email: true, avatar: true } },
            },
        });

        if (!session) return null;

        if (role !== 'ADMIN') {
            const isParticipant = session.userId === requestingUserId || session.consultantUserId === requestingUserId;
            if (!isParticipant) return null;
        }

        return this._formatSession(session, role);
    }

    // ─────────────────────────────────────────────────────────────
    // Private helpers
    // ─────────────────────────────────────────────────────────────

    _formatSession(s, viewerRole) {
        const base = {
            id:                s.id,
            type:              s.type,
            status:            s.status,
            durationMinutes:   Number(s.durationMinutes || 0),
            durationSeconds:   s.durationSeconds || 0,
            totalCost:         Number(s.totalCost       || 0),
            consultantEarning: Number(s.consultantEarning || 0),
            platformEarning:   Number(s.platformEarning   || 0),
            pricePerMinute:    Number(s.pricePerMinute    || 2.50),
            startTime:         s.startTime,
            endTime:           s.endTime,
            date:              s.createdAt,
            rating:            s.rating    || null,
            review:            s.review    || null,
            reviewedAt:        s.reviewedAt || null,
            callId:            s.callId            || null,
            chatConversationId: s.chatConversationId || null,
        };

        if (viewerRole === 'user') {
            return {
                ...base,
                consultant: s.consultant
                    ? { id: s.consultant.id, name: s.consultant.name, avatar: s.consultant.avatar }
                    : null,
            };
        }

        if (viewerRole === 'consultant') {
            return {
                ...base,
                client: s.user
                    ? { id: s.user.id, name: s.user.name, avatar: s.user.avatar, email: s.user.email }
                    : null,
            };
        }

        return {
            ...base,
            client:     s.user       ? { id: s.user.id,       name: s.user.name,       avatar: s.user.avatar,       email: s.user.email }       : null,
            consultant: s.consultant ? { id: s.consultant.id, name: s.consultant.name, avatar: s.consultant.avatar, email: s.consultant.email } : null,
        };
    }

    _buildUserSummary(completedSessions) {
        const total      = completedSessions.length;
        const totalSpent = Number(completedSessions.reduce((s, x) => s + Number(x.totalCost),        0).toFixed(2));
        const totalMins  = Number(completedSessions.reduce((s, x) => s + Number(x.durationMinutes),   0).toFixed(2));
        return {
            totalSessions: total,
            totalSpent,
            totalMinutes:  totalMins,
            byType: {
                PHONE: completedSessions.filter(s => s.type === 'PHONE').length,
                VIDEO: completedSessions.filter(s => s.type === 'VIDEO').length,
                CHAT:  completedSessions.filter(s => s.type === 'CHAT').length,
            },
        };
    }

    _buildConsultantSummary(completedSessions) {
        const total          = completedSessions.length;
        const totalEarnings  = Number(completedSessions.reduce((s, x) => s + Number(x.consultantEarning), 0).toFixed(2));
        const totalMins      = Number(completedSessions.reduce((s, x) => s + Number(x.durationMinutes),    0).toFixed(2));
        const rated          = completedSessions.filter(x => x.rating !== null);
        const avgRating      = rated.length > 0
            ? Number((rated.reduce((s, x) => s + x.rating, 0) / rated.length).toFixed(1))
            : 0;
        return {
            totalSessions:  total,
            totalEarnings,
            totalMinutes:   totalMins,
            averageRating:  avgRating,
            byType: {
                PHONE: completedSessions.filter(s => s.type === 'PHONE').length,
                VIDEO: completedSessions.filter(s => s.type === 'VIDEO').length,
                CHAT:  completedSessions.filter(s => s.type === 'CHAT').length,
            },
        };
    }
}

export const sessionService = new SessionService();
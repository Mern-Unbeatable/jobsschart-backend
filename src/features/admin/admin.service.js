
// import { prisma } from '../../config/db.js';
// import { Logger } from '../../config/logger.js';
// const log = new Logger('AdminSessionsService');

// class AdminSessionsService {
//     async getAllSessions(queryParams = {}) {
//         const page    = Math.max(1, parseInt(queryParams.page)  || 1);
//         const limit   = Math.min(parseInt(queryParams.limit)    || 20, 100);
//         const skip    = (page - 1) * limit;
//         const type    = queryParams.type;  
//         const status  = queryParams.status;  
//         const search  = queryParams.search; 
//         let callSessions = [];

//         const shouldFetchCalls = !type || type === 'PHONE' || type === 'VIDEO';

//         if (shouldFetchCalls) {
//             const callWhere = {
//                 status: status
//                     ? status === 'COMPLETED' ? 'COMPLETED'
//                     : status === 'ACTIVE'    ? 'ACTIVE'
//                     : status === 'CANCELLED' ? 'CANCELLED'
//                     : undefined
//                     : { in: ['COMPLETED', 'ACTIVE', 'CANCELLED', 'PENDING'] },
//             };

//             if (type === 'PHONE') callWhere.callType = 'PHONE';
//             if (type === 'VIDEO') callWhere.callType = 'VIDEO';

//             const calls = await prisma.call.findMany({
//                 where: callWhere,
//                 include: {
//                     user: {
//                         select: { id: true, name: true, email: true, avatar: true },
//                     },
//                     earnings: true,
//                 },
//                 orderBy: { createdAt: 'desc' },
//             });

     
//             const callSessionsRaw = await Promise.all(
//                 calls.map(async (call) => {
//                     const consultantUser = await prisma.user.findUnique({
//                         where: { id: call.consultantId },
//                         select: {
//                             id: true, name: true, email: true, avatar: true,
//                             consultant: { select: { pricePerMinute: true } },
//                         },
//                     });

//                     // Name search filter
//                     if (search) {
//                         const q = search.toLowerCase();
//                         const consultantName = (consultantUser?.name || '').toLowerCase();
//                         const clientName     = (call.user?.name     || '').toLowerCase();
//                         if (!consultantName.includes(q) && !clientName.includes(q)) return null;
//                     }

//                     const durationMins = call.durationSeconds
//                         ? Number((call.durationSeconds / 60).toFixed(2))
//                         : 0;

//                     const earning = call.earnings?.[0] || null;
//                     const consultantEarning = earning
//                         ? Number(earning.consultantShare)
//                         : Number(((call.totalCost || 0) * 0.5).toFixed(2));

//                     return {
//                         id:                call.id,
//                         type:              call.callType,      
//                         status:            call.status,
//                         consultantId:      call.consultantId,
//                         consultantName:    consultantUser?.name  || 'Unknown',
//                         consultantEmail:   consultantUser?.email || '',
//                         consultantAvatar:  consultantUser?.avatar || null,
//                         clientId:          call.userId,
//                         clientName:        call.user?.name  || 'Unknown',
//                         clientEmail:       call.user?.email || '',
//                         clientAvatar:      call.user?.avatar || null,
//                         durationMinutes:   durationMins,
//                         durationSeconds:   call.durationSeconds || 0,
//                         totalCost:         Number(call.totalCost   || 0),
//                         consultantEarning: consultantEarning,
//                         platformEarning:   Number(((call.totalCost || 0) * 0.5).toFixed(2)),
//                         startTime:         call.startTime,
//                         endTime:           call.endTime,
//                         date:              call.createdAt,
//                         pricePerMinute:    Number(consultantUser?.consultant?.pricePerMinute || 2.5),
//                     };
//                 })
//             );

//             callSessions = callSessionsRaw.filter(Boolean);
//         }

//         // ─────────────────────────────────────────────────────────
//         // 2. CHAT sessions
//         // ─────────────────────────────────────────────────────────
//         let chatSessions = [];

//         const shouldFetchChat = !type || type === 'CHAT';

//         if (shouldFetchChat) {
//             const chatWhere = {};

//             if (status === 'COMPLETED' || status === 'ACTIVE' || status === 'CANCELLED') {
//                 // ChatConversation has sessionStatus: IDLE | ACTIVE | ENDED
//                 if (status === 'COMPLETED') chatWhere.sessionStatus = 'ENDED';
//                 else if (status === 'ACTIVE') chatWhere.sessionStatus = 'ACTIVE';
//                 // CANCELLED maps to nothing meaningful in chat
//             }

//             // Only fetch conversations that had a real session (not just opened)
//             chatWhere.sessionStatus = chatWhere.sessionStatus || { in: ['ACTIVE', 'ENDED'] };

//             const chats = await prisma.chatConversation.findMany({
//                 where: chatWhere,
//                 include: {
//                     participants: {
//                         include: {
//                             user: {
//                                 select: {
//                                     id: true, name: true, email: true, avatar: true, role: true,
//                                     consultant: { select: { pricePerMinute: true } },
//                                 },
//                             },
//                         },
//                     },
//                     billing: {
//                         orderBy: { minuteNumber: 'desc' },
//                         take: 1,
//                     },
//                 },
//                 orderBy: { updatedAt: 'desc' },
//             });

//             const chatSessionsRaw = chats.map((chat) => {
//                 const userParticipant       = chat.participants.find(p => p.user.role === 'USER');
//                 const consultantParticipant = chat.participants.find(p => p.user.role !== 'USER');

//                 if (!userParticipant || !consultantParticipant) return null;

//                 // Name search filter
//                 if (search) {
//                     const q = search.toLowerCase();
//                     const cName = (consultantParticipant.user.name || '').toLowerCase();
//                     const uName = (userParticipant.user.name       || '').toLowerCase();
//                     if (!cName.includes(q) && !uName.includes(q)) return null;
//                 }

//                 const totalMinutes = Number(chat.totalMinutes  || 0);
//                 const totalCost    = Number(chat.totalCost      || 0);
//                 const consultantEarning = Number((totalCost * 0.5).toFixed(2));
//                 const platformEarning   = Number((totalCost * 0.5).toFixed(2));

//                 // Map chatStatus → unified status
//                 let unifiedStatus = 'ACTIVE';
//                 if (chat.sessionStatus === 'ENDED') unifiedStatus = 'COMPLETED';
//                 else if (chat.sessionStatus === 'IDLE') unifiedStatus = 'CANCELLED';

//                 return {
//                     id:                chat.id,
//                     type:              'CHAT',
//                     status:            unifiedStatus,
//                     consultantId:      consultantParticipant.userId,
//                     consultantName:    consultantParticipant.user.name  || 'Unknown',
//                     consultantEmail:   consultantParticipant.user.email || '',
//                     consultantAvatar:  consultantParticipant.user.avatar || null,
//                     clientId:          userParticipant.userId,
//                     clientName:        userParticipant.user.name  || 'Unknown',
//                     clientEmail:       userParticipant.user.email || '',
//                     clientAvatar:      userParticipant.user.avatar || null,
//                     durationMinutes:   totalMinutes,
//                     durationSeconds:   totalMinutes * 60,
//                     totalCost:         totalCost,
//                     consultantEarning: consultantEarning,
//                     platformEarning:   platformEarning,
//                     startTime:         chat.startedAt,
//                     endTime:           chat.endedAt,
//                     date:              chat.createdAt,
//                     pricePerMinute:    Number(consultantParticipant.user.consultant?.pricePerMinute || 2.5),
//                 };
//             });

//             chatSessions = chatSessionsRaw.filter(Boolean);
//         }

//         // ─────────────────────────────────────────────────────────
//         // 3. Merge + Sort by date desc + Paginate
//         // ─────────────────────────────────────────────────────────
//         const allSessions = [...callSessions, ...chatSessions].sort(
//             (a, b) => new Date(b.date) - new Date(a.date)
//         );

//         const total      = allSessions.length;
//         const paginated  = allSessions.slice(skip, skip + limit);

//         // ─────────────────────────────────────────────────────────
//         // 4. Summary stats (for dashboard cards)
//         // ─────────────────────────────────────────────────────────
//         const completed = allSessions.filter(s => s.status === 'COMPLETED');
//         const summary   = {
//             totalSessions:       total,
//             completedSessions:   completed.length,
//             activeSessions:      allSessions.filter(s => s.status === 'ACTIVE').length,
//             totalRevenue:        Number(completed.reduce((sum, s) => sum + s.totalCost,         0).toFixed(2)),
//             totalEarningsPaid:   Number(completed.reduce((sum, s) => sum + s.consultantEarning, 0).toFixed(2)),
//             platformRevenue:     Number(completed.reduce((sum, s) => sum + s.platformEarning,   0).toFixed(2)),
//             totalMinutes:        Number(completed.reduce((sum, s) => sum + s.durationMinutes,    0).toFixed(2)),
//             byType: {
//                 PHONE: allSessions.filter(s => s.type === 'PHONE').length,
//                 VIDEO: allSessions.filter(s => s.type === 'VIDEO').length,
//                 CHAT:  allSessions.filter(s => s.type === 'CHAT').length,
//             },
//         };

//         return {
//             sessions: paginated,
//             meta: {
//                 page,
//                 limit,
//                 total,
//                 totalPages: Math.ceil(total / limit),
//             },
//             summary,
//         };
//     }


// }

// export const adminSessionsService = new AdminSessionsService();
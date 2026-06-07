// import { catchAsync } from '../../shared/globals/decorators/catch-async.js';
// import { ResponseHandler } from '../../shared/globals/helpers/response.handler.js';
// import { Logger } from '../../config/logger.js';
// import { adminSessionsService } from './admin.service.js';

// const log = new Logger('AdminSessionsController');

// class AdminSessionsController {

//     getAllSessions = catchAsync(async (req, res) => {
//         const { page, limit, type, status, search } = req.query;

//         log.info('Fetching all sessions', { 
//             adminId: req.user.id, 
//             query: { page, limit, type, status, search } 
//         });

//         const result = await adminSessionsService.getAllSessions({
//             page,
//             limit,
//             type,
//             status,
//             search,
//         });

//         ResponseHandler.success(res, {
//             message: 'Sessions fetched successfully',
//             data: {
//                 sessions: result.sessions,
//                 summary: result.summary,
//             },
//             meta: result.meta,
//         });
//     });
// }

// export const adminSessionsController = new AdminSessionsController();
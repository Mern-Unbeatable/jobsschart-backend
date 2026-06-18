// src/features/session/session.controller.js
import { catchAsync } from '../../shared/globals/decorators/catch-async.js';
import { ResponseHandler } from '../../shared/globals/helpers/response.handler.js';
import { Logger } from '../../config/logger.js';
import { sessionService } from './session.service.js';

const log = new Logger('SessionController');

class SessionController {

    getMySessionsAsUser = catchAsync(async (req, res) => {
        const result = await sessionService.getUserSessions(req.user.id, req.query);
        ResponseHandler.success(res, {
            message: 'Sessions fetched successfully',
            data: result,
        });
    });

    getMySessionsAsConsultant = catchAsync(async (req, res) => {
        const result = await sessionService.getConsultantSessions(req.user.id, req.query);
        ResponseHandler.success(res, {
            message: 'Consultant sessions fetched successfully',
            data: result,
        });
    });

    getAllSessionsAsAdmin = catchAsync(async (req, res) => {
        const result = await sessionService.getAllSessions(req.query);
        ResponseHandler.success(res, {
            message: 'All sessions fetched successfully',
            data: result,
        });
    });

    getSessionById = catchAsync(async (req, res) => {
        const { sessionId } = req.params;
        const session = await sessionService.getSessionById(sessionId, req.user.id, req.user.role);

        if (!session) {
            return ResponseHandler.notFound(res, 'Session not found');
        }

        ResponseHandler.success(res, {
            message: 'Session fetched successfully',
            data: { session },
        });
    });
}

export const sessionController = new SessionController();

import { catchAsync } from '../../shared/globals/decorators/catch-async.js';
import { ResponseHandler } from '../../shared/globals/helpers/response.handler.js';
import { callService } from './call.service.js';
import { Logger } from '../../config/logger.js';
import { prisma } from '../../config/db.js';
import {
    BadRequestError,
    NotFoundError,
    ForbiddenError,
    ConflictError,
} from '../../shared/globals/helpers/error-handler.js';
import { prepareCallEnd } from '../../socket/index.js';

const log = new Logger('CallController');

class CallController {
    initiateCall = catchAsync(async (req, res) => {
        const { consultantId, callType = 'PHONE' } = req.body;

        if (!consultantId) {
            return ResponseHandler.badRequest(res, { message: 'consultantId is required' });
        }
        if (!callType) {
            return ResponseHandler.badRequest(res, { message: 'callType is required (PHONE or VIDEO)' });
        }

        try {
            const result = await callService.initiateCall(req.user.id, consultantId, callType);
            ResponseHandler.success(res, {
                message: 'Call initiated successfully',
                data: result,
            });
        } catch (err) {
            log.error(`initiateCall error: ${err.message}`, { userId: req.user.id, consultantId, callType });
            if (err instanceof BadRequestError) {
                return ResponseHandler.badRequest(res, { message: err.message });
            }
            if (err instanceof NotFoundError) {
                return ResponseHandler.notFound(res, { message: err.message });
            }
            if (err instanceof ForbiddenError) {
                return ResponseHandler.forbidden(res, { message: err.message });
            }
            if (err instanceof ConflictError) {
                return res.status(409).json({
                    success: false,
                    statusCode: 409,
                    message: err.message,
                });
            }
            throw err;
        }
    });

    acceptCall = catchAsync(async (req, res) => {
        const { callId } = req.params;
        try {
            const result = await callService.acceptCall(callId, req.user.id);
            ResponseHandler.success(res, { message: 'Call accepted successfully', data: result });
        } catch (err) {
            if (err instanceof BadRequestError) return ResponseHandler.badRequest(res, { message: err.message });
            if (err instanceof NotFoundError) return ResponseHandler.notFound(res, { message: err.message });
            if (err instanceof ForbiddenError) return ResponseHandler.forbidden(res, { message: err.message });
            throw err;
        }
    });

    rejectCall = catchAsync(async (req, res) => {
        const { callId } = req.params;
        try {
            const result = await callService.rejectCall(callId, req.user.id);
            ResponseHandler.success(res, { message: 'Call rejected', data: result });
        } catch (err) {
            if (err instanceof BadRequestError) return ResponseHandler.badRequest(res, { message: err.message });
            if (err instanceof NotFoundError) return ResponseHandler.notFound(res, { message: err.message });
            if (err instanceof ForbiddenError) return ResponseHandler.forbidden(res, { message: err.message });
            throw err;
        }
    });

    joinCall = catchAsync(async (req, res) => {
        const { callId } = req.params;
        try {
            const result = await callService.joinCall(callId, req.user.id, req.user.role);
            ResponseHandler.success(res, { message: 'Call joined successfully', data: result });
        } catch (err) {
            if (err instanceof BadRequestError) return ResponseHandler.badRequest(res, { message: err.message });
            if (err instanceof NotFoundError) return ResponseHandler.notFound(res, { message: err.message });
            if (err instanceof ForbiddenError) return ResponseHandler.forbidden(res, { message: err.message });
            throw err;
        }
    });

    endCall = catchAsync(async (req, res) => {
        const { callId } = req.params;
        const endTimestamp = Date.now();
        try {
            try {
                await prepareCallEnd(callId, req.user.id, endTimestamp);
            } catch (socketErr) {
                log.warn(`prepareCallEnd non-fatal: ${socketErr.message}`);
            }
            const result = await callService.endCall(callId, req.user.id, endTimestamp);
            ResponseHandler.success(res, { message: 'Call ended successfully', data: result });
        } catch (err) {
            if (err instanceof BadRequestError) return ResponseHandler.badRequest(res, { message: err.message });
            if (err instanceof NotFoundError) return ResponseHandler.notFound(res, { message: err.message });
            if (err instanceof ForbiddenError) return ResponseHandler.forbidden(res, { message: err.message });
            throw err;
        }
    });

    cancelCall = catchAsync(async (req, res) => {
        const { callId } = req.params;
        try {
            const call = await callService.cancelCall(callId, req.user.id);
            ResponseHandler.success(res, { message: 'Call cancelled successfully', data: { call } });
        } catch (err) {
            if (err instanceof BadRequestError) return ResponseHandler.badRequest(res, { message: err.message });
            if (err instanceof NotFoundError) return ResponseHandler.notFound(res, { message: err.message });
            if (err instanceof ForbiddenError) return ResponseHandler.forbidden(res, { message: err.message });
            throw err;
        }
    });

    clearStuckCalls = catchAsync(async (req, res) => {
        const result = await callService.forceEndUserCalls(req.user.id);
        ResponseHandler.success(res, {
            message: 'Stuck calls cleared',
            data: { cleared: result.count },
        });
    });

    getPendingCalls = catchAsync(async (req, res) => {
        const calls = await callService.getPendingCalls(req.user.id);
        ResponseHandler.success(res, { message: 'Pending calls fetched successfully', data: { calls } });
    });

    getCallHistory = catchAsync(async (req, res) => {
        const result = await callService.getUserCallHistory(req.user.id, req.query);
        ResponseHandler.success(res, { message: 'Call history fetched successfully', data: result });
    });

    getCallById = catchAsync(async (req, res) => {
        const { callId } = req.params;
        const call = await callService.getCallById(callId, req.user.id, req.user.role);
        ResponseHandler.success(res, { message: 'Call fetched successfully', data: { call } });
    });

    getConsultantEarnings = catchAsync(async (req, res) => {
        const consultant = await prisma.consultant.findUnique({
            where: { userId: req.user.id },
            select: { id: true },
        });

        if (!consultant && req.user.role !== 'ADMIN') {
            return ResponseHandler.forbidden(res, { message: 'Only consultants can access earnings' });
        }

        ResponseHandler.success(res, {
            message: 'Use /payout endpoints for earnings',
            data: { consultantId: consultant?.id },
        });
    });
}

export const callController = new CallController();

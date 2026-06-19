
import { catchAsync } from '../../shared/globals/decorators/catch-async.js';
import { ResponseHandler } from '../../shared/globals/helpers/response.handler.js';
import { callService } from './call.service.js';
import { Logger } from '../../config/logger.js';
import { prisma } from '../../config/db.js';

const log = new Logger('CallController');

class CallController {
    initiateCall = catchAsync(async (req, res) => {
        const { consultantId, callType } = req.body;

        console.log('📞 Initiate call request:', { userId: req.user.id, consultantId, callType });

        const result = await callService.initiateCall(req.user.id, consultantId, callType);

        ResponseHandler.success(res, {
            message: 'Call initiated successfully',
            data: result,
        });
    });


    acceptCall = catchAsync(async (req, res) => {
        const { callId } = req.params;

        console.log('✅ Accept call request:', { callId, consultantId: req.user.id });

        const result = await callService.acceptCall(callId, req.user.id);

        ResponseHandler.success(res, {
            message: 'Call accepted successfully',
            data: result,
        });
    });

    rejectCall = catchAsync(async (req, res) => {
        const { callId } = req.params;

        console.log('❌ Reject call request:', { callId, consultantId: req.user.id });

        const result = await callService.rejectCall(callId, req.user.id);

        ResponseHandler.success(res, {
            message: 'Call rejected',
            data: result,
        });
    });

    joinCall = catchAsync(async (req, res) => {
        const { callId } = req.params;

        console.log('🎥 Join call request:', { callId, userId: req.user.id });

        const result = await callService.joinCall(callId, req.user.id, req.user.role);

        ResponseHandler.success(res, {
            message: 'Call joined successfully',
            data: result,
        });
    });

    endCall = catchAsync(async (req, res) => {
        const { callId } = req.params;

        console.log('📴 End call request:', { callId, userId: req.user.id });

        const result = await callService.endCall(callId, req.user.id);

        ResponseHandler.success(res, {
            message: 'Call ended successfully',
            data: result,
        });
    });


    cancelCall = catchAsync(async (req, res) => {
        const { callId } = req.params;

        console.log('🚫 Cancel call request:', { callId, userId: req.user.id });

        const call = await callService.cancelCall(callId, req.user.id);

        ResponseHandler.success(res, {
            message: 'Call cancelled successfully',
            data: { call },
        });
    });

    getPendingCalls = catchAsync(async (req, res) => {
        console.log('📋 Get pending calls for:', req.user.id);

        const calls = await callService.getPendingCalls(req.user.id);

        ResponseHandler.success(res, {
            message: 'Pending calls fetched successfully',
            data: { calls },
        });
    });

    getCallHistory = catchAsync(async (req, res) => {
        const result = await callService.getUserCallHistory(req.user.id, req.query);

        ResponseHandler.success(res, {
            message: 'Call history fetched successfully',
            data: result,
        });
    });

    getCallById = catchAsync(async (req, res) => {
        const { callId } = req.params;

        console.log('🔍 Get call by ID:', callId);

        const call = await callService.getCallById(callId, req.user.id, req.user.role);

        ResponseHandler.success(res, {
            message: 'Call fetched successfully',
            data: { call },
        });
    });

    getConsultantEarnings = catchAsync(async (req, res) => {
        const consultant = await prisma.consultant.findUnique({
            where: { userId: req.user.id },
            select: { id: true },
        });

        if (!consultant && req.user.role !== 'ADMIN') {
            return ResponseHandler.forbidden(res, 'Only consultants can access earnings');
        }

        const consultantId = consultant?.id || req.query.consultantId;
        const result = await callService.getConsultantEarnings(consultantId, req.query);

        ResponseHandler.success(res, {
            message: 'Earnings fetched successfully',
            data: result,
        });
    });
}

export const callController = new CallController();
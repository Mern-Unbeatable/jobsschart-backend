// src/features/consultant/consultant.controller.js
import { Logger } from '../../config/logger.js';
import { catchAsync } from '../../shared/globals/decorators/catch-async.js';
import { ResponseHandler } from '../../shared/globals/helpers/response.handler.js';
import { consultantService } from './consultant.service.js';
import {
    updateConsultantProfileSchema,
    updateOnlineStatusSchema,
    approveConsultantSchema,
} from './consultant.validation.js';

class ConsultantController {
    constructor() {
        this.log = new Logger('ConsultantController');
    }

    // ========== Consultant Self-Service ==========
    getMyConsultantProfile = catchAsync(async (req, res) => {
        const userId = req.user.id;
        const profile = await consultantService.getConsultantProfile(userId);

        if (!profile) throw new Error('Consultant profile not found');

        ResponseHandler.success(res, {
            message: 'Consultant profile fetched successfully',
            data: { profile },
        });
    });

    updateMyConsultantProfile = catchAsync(async (req, res) => {
        const userId = req.user.id;
        const data = updateConsultantProfileSchema.parse(req.body);

        const updated = await consultantService.updateConsultantProfile(userId, data);

        ResponseHandler.updated(res, {
            message: 'Consultant profile updated successfully',
            data: { profile: updated },
        });
    });

    updateOnlineStatus = catchAsync(async (req, res) => {
        const userId = req.user.id;
        const { onlineStatus } = updateOnlineStatusSchema.parse(req.body);

        const updated = await consultantService.updateOnlineStatus(userId, onlineStatus);

        ResponseHandler.updated(res, {
            message: `Online status updated to ${onlineStatus}`,
            data: { status: updated.onlineStatus },
        });
    });


    getAllConsultants = catchAsync(async (req, res) => {
        const result = await consultantService.getAllConsultants(req.query);

        ResponseHandler.success(res, {
            message: 'Consultants fetched successfully',
            data: result,
        });
    });

    getConsultantById = catchAsync(async (req, res) => {
        const { id } = req.params;
        const consultant = await consultantService.getConsultantById(id);

        if (!consultant) throw new Error('Consultant not found');

        ResponseHandler.success(res, {
            message: 'Consultant fetched successfully',
            data: { consultant },
        });
    });


    approveConsultant = catchAsync(async (req, res) => {
        const { id } = req.params;
        const { isApproved } = approveConsultantSchema.parse(req.body);

        const updated = await consultantService.approveConsultant(id, isApproved);

        ResponseHandler.updated(res, {
            message: `Consultant ${isApproved ? 'approved' : 'disapproved'} successfully`,
            data: { consultant: updated },
        });
    });


getEarningsDashboard = catchAsync(async (req, res) => {
    const userId = req.user.id;
    const dashboardData = await consultantService.getEarningsDashboard(userId);

    ResponseHandler.success(res, {
        message: 'Earnings dashboard fetched successfully',
        data: dashboardData,
    });
});

getEarningsOverTime = catchAsync(async (req, res) => {
    const userId = req.user.id;
    const { period = 'monthly' } = req.query;
    
    const data = await consultantService.getEarningsOverTime(userId, period);

    ResponseHandler.success(res, {
        message: 'Earnings over time fetched successfully',
        data,
    });
});


}

export const consultantController = new ConsultantController();
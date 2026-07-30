// src/features/consultant/consultant.controller.js
import { Logger } from '../../config/logger.js';
import { catchAsync } from '../../shared/globals/decorators/catch-async.js';
import { NotFoundError } from '../../shared/globals/helpers/error-handler.js';
import { ResponseHandler } from '../../shared/globals/helpers/response.handler.js';
import { consultantService } from './consultant.service.js';
import {
    updateConsultantProfileSchema,
    updateOnlineStatusSchema,
    approveConsultantSchema,
    updateVerificationInfoSchema,
    reviewVerificationSchema,
} from './consultant.validation.js';

class ConsultantController {
    constructor() {
        this.log = new Logger('ConsultantController');
    }

    // ========== Consultant Self-Service ==========
    getMyConsultantProfile = catchAsync(async (req, res) => {
        const userId = req.user.id;
        const profile = await consultantService.getConsultantProfile(userId);

        if (!profile) throw new NotFoundError('Consultant profile not found');

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

        if (!consultant) throw new NotFoundError('Consultant not found');

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

    getMonthlyInvoices = catchAsync(async (req, res) => {
        const userId = req.user.id;
        const invoices = await consultantService.getMonthlyInvoices(userId);
        ResponseHandler.success(res, {
            message: 'Monthly invoices fetched successfully',
            data: { invoices },
        });
    });

    downloadInvoice = catchAsync(async (req, res) => {
        const userId = req.user.id;
        const { year, month } = req.params;
        const { filename, buffer, contentType } = await consultantService.getInvoiceDownload(userId, year, month);
        res.setHeader('Content-Type', contentType || 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
    });

    updateVerificationInfo = catchAsync(async (req, res) => {
        const userId = req.user.id;
        const existing = await consultantService.getConsultantProfile(userId);

        const data = updateVerificationInfoSchema.parse({
            ...req.body,
            idFrontUrl: req.body.idFrontUrl || existing?.idFrontUrl,
            idBackUrl: req.body.idBackUrl || existing?.idBackUrl,
        });
        const updated = await consultantService.updateVerificationInfo(userId, data);
        ResponseHandler.updated(res, {
            message: 'Verification information submitted successfully',
            data: { consultant: updated },
        });
    });

    getPendingVerifications = catchAsync(async (req, res) => {
        const consultants = await consultantService.getPendingVerifications();
        ResponseHandler.success(res, {
            message: 'Pending verifications fetched',
            data: { consultants },
        });
    });

    reviewVerification = catchAsync(async (req, res) => {
        const { id } = req.params;
        const payload = reviewVerificationSchema.parse(req.body);
        const updated = await consultantService.reviewVerification(id, payload);
        ResponseHandler.updated(res, {
            message: `Verification ${payload.status.toLowerCase()}`,
            data: { consultant: updated },
        });
    });
}

export const consultantController = new ConsultantController();
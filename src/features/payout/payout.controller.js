// src/modules/payout/payout.controller.js
import { catchAsync } from '../../shared/globals/decorators/catch-async.js';
import { ResponseHandler } from '../../shared/globals/helpers/response.handler.js';
import { payoutService } from './payout.service.js';
import { Logger } from '../../config/logger.js';

const log = new Logger('PayoutController');

class PayoutController {

    // ── CONSULTANT ────────────────────────────────────────────────────

    getMyBalance = catchAsync(async (req, res) => {
        const balance = await payoutService.getConsultantBalance(req.user.id);
        ResponseHandler.success(res, {
            message: 'Balance fetched successfully',
            data: balance,
        });
    });

    /** POST /payout/request
     *  Body: { amount, organisationName, routingNumber, accountNumber }
     */
    requestPayout = catchAsync(async (req, res) => {
        const { amount, organisationName, routingNumber, accountNumber } = req.body;

        const payout = await payoutService.requestPayout(req.user.id, {
            amount: parseFloat(amount),
            organisationName,
            routingNumber,
            accountNumber,
        });

        ResponseHandler.success(res, {
            message: 'Payout request submitted successfully. Admin will review within 1-3 business days.',
            data: payout,
        }, 201);
    });

    getMyPayouts = catchAsync(async (req, res) => {
        const result = await payoutService.getMyPayouts(req.user.id, req.query);
        ResponseHandler.success(res, {
            message: 'Payouts fetched successfully',
            data: result,
        });
    });

    // ── ADMIN ─────────────────────────────────────────────────────────

    getAllPayouts = catchAsync(async (req, res) => {
        const result = await payoutService.getAllPayouts(req.query);
        ResponseHandler.success(res, {
            message: 'All payouts fetched successfully',
            data: result,
        });
    });

    approvePayout = catchAsync(async (req, res) => {
        const { payoutId } = req.params;
        const { adminNote } = req.body;

        log.info(`Admin ${req.user.id} approving payout ${payoutId}`);

        const payout = await payoutService.approvePayout(payoutId, req.user.id, { adminNote });
        ResponseHandler.success(res, {
            message: 'Payout approved successfully. Please complete the bank transfer manually.',
            data: payout,
        });
    });

    rejectPayout = catchAsync(async (req, res) => {
        const { payoutId } = req.params;
        const { rejectReason } = req.body;

        log.info(`Admin ${req.user.id} rejecting payout ${payoutId}`);

        const payout = await payoutService.rejectPayout(payoutId, req.user.id, { rejectReason });
        ResponseHandler.success(res, {
            message: 'Payout rejected successfully',
            data: payout,
        });
    });

    getPlatformSummary = catchAsync(async (req, res) => {
        const summary = await payoutService.getPlatformEarningsSummary(req.query);
        ResponseHandler.success(res, {
            message: 'Platform earnings summary fetched',
            data: summary,
        });
    });

    getConsultantEarningsDetail = catchAsync(async (req, res) => {
        const { consultantId } = req.params;
        const result = await payoutService.getConsultantEarningsDetail(consultantId, req.query);
        ResponseHandler.success(res, {
            message: 'Consultant earnings fetched',
            data: result,
        });
    });
}

export const payoutController = new PayoutController();

import { Logger } from '../../config/logger.js';
import { catchAsync } from '../../shared/globals/decorators/catch-async.js';
import { ResponseHandler } from '../../shared/globals/helpers/response.handler.js';
import { donationService } from './donation.service.js';
import { createDonationSchema, updateDonationSchema } from './donation.validation.js';

class DonationController {
    constructor() {
        this.log = new Logger('DonationController');
    }

    getMyDonations = catchAsync(async (req, res) => {
        const result = await donationService.getMyDonations(req.user.id, req.query);
        ResponseHandler.success(res, { message: 'Your donations fetched successfully', data: result });
    });

    getAllDonations = catchAsync(async (req, res) => {
        const result = await donationService.getAllDonations(req.query);
        ResponseHandler.success(res, { message: 'All donations fetched successfully', data: result });
    });

    getDonationStats = catchAsync(async (req, res) => {
        const stats = await donationService.getDonationStats();
        ResponseHandler.success(res, { message: 'Donation stats fetched', data: { stats } });
    });

    getDonationById = catchAsync(async (req, res) => {
        const donation = await donationService.getDonationById(req.params.id);
        ResponseHandler.success(res, { message: 'Donation fetched successfully', data: { donation } });
    });


    deleteDonation = catchAsync(async (req, res) => {
        this.log.info(`Deleting donation ${req.params.id}`);
        const result = await donationService.deleteDonation(req.params.id, req.user.id, req.user.role);
        ResponseHandler.success(res, { message: result.message, data: { deletedAt: new Date().toISOString() } });
    });
}

export const donationController = new DonationController();
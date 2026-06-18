
import { catchAsync } from '../../shared/globals/decorators/catch-async.js';
import { ResponseHandler } from '../../shared/globals/helpers/response.handler.js';
import { adCampaignService } from './adcampaign.service.js';
import { Logger } from '../../config/logger.js';

const log = new Logger('AdCampaignController');

class AdCampaignController {
    getAllCampaigns = catchAsync(async (req, res) => {
        const result = await adCampaignService.getAllCampaigns(req.query);
        ResponseHandler.success(res, { message: 'Campaigns fetched successfully', data: result });
    });




    getCampaignById = catchAsync(async (req, res) => {
        const campaign = await adCampaignService.getCampaignById(req.params.id);
        ResponseHandler.success(res, { message: 'Campaign fetched successfully', data: { campaign } });
    });

    publishCampaign = catchAsync(async (req, res) => {
        log.info(`Publishing campaign: ${req.params.id}`);
        const campaign = await adCampaignService.publishCampaign(req.params.id, req.body);
        ResponseHandler.success(res, { message: 'Campaign published successfully', data: { campaign } });
    });

    unpublishCampaign = catchAsync(async (req, res) => {
        log.info(`Unpublishing campaign: ${req.params.id}`);
        const campaign = await adCampaignService.unpublishCampaign(req.params.id);
        ResponseHandler.success(res, { message: 'Campaign unpublished successfully', data: { campaign } });
    });

    updateCampaignSettings = catchAsync(async (req, res) => {
        const campaign = await adCampaignService.updateCampaignSettings(req.params.id, req.body);
        ResponseHandler.success(res, { message: 'Campaign settings updated successfully', data: { campaign } });
    });

    deleteCampaign = catchAsync(async (req, res) => {
        log.info(`Deleting campaign: ${req.params.id}`);
        const result = await adCampaignService.deleteCampaign(req.params.id);
        ResponseHandler.success(res, { message: result.message, data: { deletedAt: new Date().toISOString() } });
    });

    getActiveCampaigns = catchAsync(async (req, res) => {
        const campaigns = await adCampaignService.getActiveCampaigns(req.query.placement);
        ResponseHandler.success(res, { message: 'Active campaigns fetched successfully', data: { campaigns } });
    });

    trackClick = catchAsync(async (req, res) => {
        const campaign = await adCampaignService.trackClick(req.params.id);
        ResponseHandler.success(res, { message: 'Click tracked successfully', data: { clicks: campaign.clicks } });
    });
}

export const adCampaignController = new AdCampaignController();
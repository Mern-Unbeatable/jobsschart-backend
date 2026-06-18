
import express from 'express';
import { authMiddleware } from '../../shared/globals/helpers/auth-middleware.js';
import { adCampaignController } from './adcampaign.controller.js';
import { validateZod } from '../../shared/globals/helpers/zodValidate.js';
import { publishCampaignSchema, updateCampaignSettingsSchema } from './adcampaign.validation.js';

const router = express.Router();

router.get('/active', adCampaignController.getActiveCampaigns);

router.post('/:id/click', adCampaignController.trackClick);


router.use(authMiddleware.protect, authMiddleware.authorize('ADMIN'));
router.get('/admin/all', adCampaignController.getAllCampaigns);


router.get('/:id', adCampaignController.getCampaignById);

router.patch(
    '/:id/publish',
    validateZod(publishCampaignSchema),
    adCampaignController.publishCampaign
);
router.patch('/:id/unpublish', adCampaignController.unpublishCampaign);

router.patch(
    '/:id/settings',
    validateZod(updateCampaignSettingsSchema),
    adCampaignController.updateCampaignSettings
);

router.delete('/:id', adCampaignController.deleteCampaign);

export const adCampaignRoutes = router;
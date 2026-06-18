
import express from 'express';
import { authMiddleware } from '../../shared/globals/helpers/auth-middleware.js';
import { donationController } from './donation.controller.js';
import { uploadDonationWithNestedImage, uploadSingleImage } from '../../shared/upload/index.js';

const router = express.Router();

router.get('/', donationController.getAllDonations);
router.get('/stats', donationController.getDonationStats);
router.get('/me', authMiddleware.protect, donationController.getMyDonations);
router.get('/:id', donationController.getDonationById);

router.use(authMiddleware.protect);

router.delete('/:id', donationController.deleteDonation);

export const donationRoutes = router;
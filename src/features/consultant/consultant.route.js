import express from 'express';
import { authMiddleware } from '../../shared/globals/helpers/auth-middleware.js';
import { consultantController } from './consultant.controller.js';
import { uploadVerificationDocuments } from '../../shared/upload/index.js';

const router = express.Router();

router.get('/', consultantController.getAllConsultants);
router.get(
    '/admin/verifications',
    authMiddleware.protect,
    authMiddleware.authorize('ADMIN'),
    consultantController.getPendingVerifications
);
router.get('/:id', consultantController.getConsultantById);

router.use(authMiddleware.protect);

router.get('/me/profile', authMiddleware.isConsultant, consultantController.getMyConsultantProfile);
router.patch('/me/profile', authMiddleware.isConsultant, consultantController.updateMyConsultantProfile);
router.patch('/me/status', authMiddleware.isConsultant, consultantController.updateOnlineStatus);
router.get('/me/earnings/dashboard', authMiddleware.isConsultant, consultantController.getEarningsDashboard);
router.get('/me/earnings/over-time', authMiddleware.isConsultant, consultantController.getEarningsOverTime);
router.get('/me/invoices', authMiddleware.isConsultant, consultantController.getMonthlyInvoices);
router.get('/me/invoices/:year/:month/download', authMiddleware.isConsultant, consultantController.downloadInvoice);
router.patch(
    '/me/verification',
    authMiddleware.isConsultant,
    uploadVerificationDocuments(),
    consultantController.updateVerificationInfo
);
router.patch(
    '/:id/verification-review',
    authMiddleware.authorize('ADMIN'),
    consultantController.reviewVerification
);
router.patch(
    '/:id/approve',
    authMiddleware.authorize('ADMIN'),
    consultantController.approveConsultant
);

export const consultantRoutes = router;

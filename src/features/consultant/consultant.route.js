import express from 'express';
import { authMiddleware } from '../../shared/globals/helpers/auth-middleware.js';
import { consultantController } from './consultant.controller.js';

const router = express.Router();


router.get('/', consultantController.getAllConsultants);
router.get('/:id', consultantController.getConsultantById);

router.use(authMiddleware.protect);


router.get('/me/profile', authMiddleware.isConsultant, consultantController.getMyConsultantProfile);
router.patch('/me/profile', authMiddleware.isConsultant, consultantController.updateMyConsultantProfile);
router.patch('/me/status', authMiddleware.isConsultant, consultantController.updateOnlineStatus);
router.get('/me/earnings/dashboard', authMiddleware.isConsultant, consultantController.getEarningsDashboard);
router.get('/me/earnings/over-time', authMiddleware.isConsultant, consultantController.getEarningsOverTime);
router.patch(
    '/:id/approve',
    authMiddleware.authorize('ADMIN'),
    consultantController.approveConsultant
);

export const consultantRoutes = router;
import express from 'express';
import { authMiddleware } from '../../shared/globals/helpers/auth-middleware.js';
import { adminDashboardController } from './admin.controller.js';

const router = express.Router();

router.use(authMiddleware.protect);
router.use(authMiddleware.authorize('ADMIN'));

router.get('/stats', adminDashboardController.getStats);

router.get('/revenue-chart', adminDashboardController.getRevenueChart);

export const adminDashboardRoutes = router;
// src/modules/payout/payout.routes.js
import express from 'express';
import { authMiddleware } from '../../shared/globals/helpers/auth-middleware.js';
import { payoutController } from './payout.controller.js';
import { validatePayoutRequest, validateApprove, validateReject } from './payout.validation.js';

const router = express.Router();

router.use(authMiddleware.protect);

// ── CONSULTANT ──────────────────────────────────────────────────
const consultantOnly = authMiddleware.authorize('CONSULTANT');

router.get('/balance',    consultantOnly, payoutController.getMyBalance);
router.post('/request',   consultantOnly, validatePayoutRequest, payoutController.requestPayout);
router.get('/my-payouts', consultantOnly, payoutController.getMyPayouts);

// ── ADMIN ────────────────────────────────────────────────────────
const adminOnly = authMiddleware.authorize('ADMIN');

router.get('/admin/all',                               adminOnly, payoutController.getAllPayouts);
router.get('/admin/platform-summary',                  adminOnly, payoutController.getPlatformSummary);
router.get('/admin/consultant/:consultantId/earnings', adminOnly, payoutController.getConsultantEarningsDetail);
router.post('/admin/:payoutId/approve', adminOnly, validateApprove, payoutController.approvePayout);
router.post('/admin/:payoutId/reject',  adminOnly, validateReject,  payoutController.rejectPayout);

export const payoutRoutes = router;
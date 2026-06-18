
import express from 'express';
import { authMiddleware } from '../../shared/globals/helpers/auth-middleware.js';
import { paymentController } from './payment.controller.js';
import { uploadDonationWithNestedImage, uploadSingleImage } from '../../shared/upload/index.js';

const router = express.Router();

router.post('/webhook', paymentController.handleWebhook);

// Protected routes
router.use(authMiddleware.protect);

router.post('/checkout', uploadDonationWithNestedImage('donations'), paymentController.createCheckout);
router.get('/verify', paymentController.verifyPayment);
router.get('/history', paymentController.getPaymentHistory);

// Admin routes
router.get('/admin/all', authMiddleware.authorize('ADMIN'), paymentController.getAllPayments);

export const paymentRoutes = router;
// src/features/schedule/schedule.routes.js
import express from 'express';
import { authMiddleware } from '../../shared/globals/helpers/auth-middleware.js';
import { scheduleController } from './schedule.controller.js';

const router = express.Router();

// Protected routes (authentication required)
router.use(authMiddleware.protect);

// ========== USER BOOKING ROUTES ==========
router.post('/bookings', scheduleController.createBooking);
router.get('/my-bookings', scheduleController.getMyBookings);
router.get('/my-bookings/upcoming', scheduleController.getMyUpcomingBookings);
router.patch('/bookings/:id/status', scheduleController.updateBookingStatus);
router.patch('/bookings/:id/cancel', scheduleController.cancelBooking);

// ========== CONSULTANT BOOKING ROUTES ==========
router.get('/consultant/bookings', authMiddleware.authorize('CONSULTANT'), scheduleController.getConsultantBookings);
router.get('/consultant/bookings/upcoming', authMiddleware.authorize('CONSULTANT'), scheduleController.getConsultantUpcomingBookings);
router.patch('/consultant/bookings/:id/confirm', authMiddleware.authorize('CONSULTANT'), scheduleController.confirmBooking);
router.patch('/consultant/bookings/:id/cancel', authMiddleware.authorize('CONSULTANT'), scheduleController.cancelConsultantBooking);
router.patch('/consultant/bookings/:id/complete', authMiddleware.authorize('CONSULTANT'), scheduleController.completeBooking);

export const scheduleRoutes = router;
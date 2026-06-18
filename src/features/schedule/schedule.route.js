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
router.patch('/bookings/:id/status', scheduleController.updateBookingStatus);
router.patch('/bookings/:id/cancel', scheduleController.cancelBooking);

// ========== CONSULTANT BOOKING ROUTES ==========
router.get('/consultant/bookings', authMiddleware.isConsultant, scheduleController.getConsultantBookings);

export const scheduleRoutes = router;
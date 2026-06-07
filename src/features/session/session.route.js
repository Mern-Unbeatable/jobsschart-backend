// src/features/session/session.routes.js
import express from 'express';
import { sessionController } from './session.controller.js';
import { authMiddleware } from '../../shared/globals/helpers/auth-middleware.js';

const router = express.Router();

// All routes require authentication
router.use(authMiddleware.protect);

// User routes
router.get('/my', sessionController.getMySessionsAsUser);

// Consultant routes
router.get('/consultant/my', sessionController.getMySessionsAsConsultant);

// Admin routes
router.get('/admin/all', authMiddleware.authorize('ADMIN'), sessionController.getAllSessionsAsAdmin);

// Shared route (works for user, consultant, admin based on permissions)
router.get('/:sessionId', sessionController.getSessionById);

export const sessionRoutes = router;
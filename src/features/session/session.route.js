
import express from 'express';
import { sessionController } from './session.controller.js';
import { authMiddleware } from '../../shared/globals/helpers/auth-middleware.js';

const router = express.Router();
router.use(authMiddleware.protect);


router.get('/my', sessionController.getMySessionsAsUser);


router.get('/consultant/my', sessionController.getMySessionsAsConsultant);

router.get('/admin/all', authMiddleware.authorize('ADMIN'), sessionController.getAllSessionsAsAdmin);


router.get('/:sessionId', sessionController.getSessionById);

router.get(
    '/consultant/recent-clients',
    authMiddleware.authorize('CONSULTANT'),
    sessionController.getRecentClients
);
export const sessionRoutes = router;
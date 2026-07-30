import express from 'express';
import { authMiddleware } from '../../shared/globals/helpers/auth-middleware.js';
import { callController } from './call.controller.js';
const router = express.Router();
router.use(authMiddleware.protect);
router.post('/initiate', callController.initiateCall);
router.post('/clear-stuck', callController.clearStuckCalls);
router.post('/:callId/accept', callController.acceptCall);
router.post('/:callId/reject', callController.rejectCall);
router.post('/:callId/join', callController.joinCall);
router.post('/:callId/end', callController.endCall);
router.post('/:callId/cancel', callController.cancelCall);

router.get('/pending', callController.getPendingCalls);
router.get('/history', callController.getCallHistory);
router.get('/earnings', callController.getConsultantEarnings);
router.get('/:callId', callController.getCallById);

export const callRoutes = router;
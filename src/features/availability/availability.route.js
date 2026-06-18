import express from 'express';
import { authMiddleware } from '../../shared/globals/helpers/auth-middleware.js';
import { availabilityController } from './availability.controller.js';

const router = express.Router();
router.get('/consultants/:consultantId/slots', availabilityController.getConsultantAvailabilitySlots);
router.use(authMiddleware.protect);
router.use(authMiddleware.isConsultant);


router.post('/slots/bulk', availabilityController.bulkCreateSlots);


router.get('/my-slots', availabilityController.getMyAvailabilitySlots);

router.patch('/slots/:id', availabilityController.updateAvailabilitySlot);
router.delete('/slots/:id', availabilityController.deleteAvailabilitySlot);


export const availabilityRoutes = router;
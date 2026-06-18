import express from 'express';
import { authMiddleware } from '../../shared/globals/helpers/auth-middleware.js';
import { faqController } from './faq.controller.js';
import { validateZod } from '../../shared/globals/helpers/zodValidate.js';
import { createFaqSchema, updateFaqSchema } from './faq.validation.js';

const router = express.Router();

router.get('/',  faqController.getAllFaqs);
router.get('/:id', faqController.getFaqById);

router.post(
  '/',
  authMiddleware.protect,
  authMiddleware.authorize('ADMIN'),
  validateZod(createFaqSchema),
  faqController.createFaq
);

router.patch(
  '/:id',
  authMiddleware.protect,
  authMiddleware.authorize('ADMIN'),
  validateZod(updateFaqSchema),
  faqController.updateFaq
);

router.delete(
  '/:id',
  authMiddleware.protect,
  authMiddleware.authorize('ADMIN'),
  faqController.deleteFaq
);

export const faqRoutes = router;
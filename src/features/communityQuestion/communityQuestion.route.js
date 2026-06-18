import express from 'express';
import { authMiddleware } from '../../shared/globals/helpers/auth-middleware.js';
import { communityQuestionController } from './communityQuestion.controller.js';
import { validateZod } from '../../shared/globals/helpers/zodValidate.js';
import {
  createQuestionSchema,
  answerQuestionSchema,
  updateQuestionStatusSchema,
} from './communityQuestion.validation.js';

const router = express.Router();

router.post(
  '/',
  authMiddleware.protect,
  validateZod(createQuestionSchema),
  communityQuestionController.createQuestion
);

router.get(
  '/my-questions',
  authMiddleware.protect,
  communityQuestionController.getMyQuestions
);

router.get(
  '/my-questions/:id',
  authMiddleware.protect,
  communityQuestionController.getMyQuestionById
);

router.get(
  '/admin/all',
  authMiddleware.protect,
  authMiddleware.authorize('ADMIN'),
  communityQuestionController.getAllQuestions
);


router.post(
  '/admin/:id/answer',
  authMiddleware.protect,
  authMiddleware.authorize('ADMIN'),
  validateZod(answerQuestionSchema),
  communityQuestionController.answerQuestion
);


router.patch(
  '/admin/:id/answer',
  authMiddleware.protect,
  authMiddleware.authorize('ADMIN'),
  validateZod(answerQuestionSchema),
  communityQuestionController.updateAnswer
);


router.patch(
  '/admin/:id/status',
  authMiddleware.protect,
  authMiddleware.authorize('ADMIN'),
  validateZod(updateQuestionStatusSchema),
  communityQuestionController.updateQuestionStatus
);

router.delete(
  '/admin/:id',
  authMiddleware.protect,
  authMiddleware.authorize('ADMIN'),
  communityQuestionController.deleteQuestion
);

export const communityQuestionRoutes = router;
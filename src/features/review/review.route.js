import express from 'express';
import { authMiddleware } from '../../shared/globals/helpers/auth-middleware.js';
import { reviewController } from './review.controller.js';

const router = express.Router();

router.use(authMiddleware.protect);
router.post('/', reviewController.createReview);


export const reviewRoutes = router;
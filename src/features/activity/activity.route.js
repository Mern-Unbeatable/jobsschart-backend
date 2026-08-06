import express from 'express';
import { authMiddleware } from '../../shared/globals/helpers/auth-middleware.js';
import { activityController } from './activity.controller.js';
import { uploadSingleImage } from '../../shared/upload/index.js';
import { validateZod } from '../../shared/globals/helpers/zodValidate.js';
import {
  createActivitySchema,
  updateActivitySchema,
  registerActivitySchema,
} from './activity.validation.js';

const router = express.Router();

// Public routes
router.get('/', activityController.getAllActivities);

router.get(
  '/stats',
  authMiddleware.protect,
  authMiddleware.authorize('ADMIN'),
  activityController.getActivityStats
);

router.post(
  '/:id/register',
  validateZod(registerActivitySchema),
  activityController.registerForActivity
);

router.get('/:id', activityController.getActivityById);

// Admin routes
router.post(
  '/',
  authMiddleware.protect,
  authMiddleware.authorize('ADMIN'),
  uploadSingleImage('image', 'activities'),
  validateZod(createActivitySchema),
  activityController.createActivity
);

router.patch(
  '/:id',
  authMiddleware.protect,
  authMiddleware.authorize('ADMIN'),
  uploadSingleImage('image', 'activities'),
  validateZod(updateActivitySchema),
  activityController.updateActivity
);

router.delete(
  '/:id',
  authMiddleware.protect,
  authMiddleware.authorize('ADMIN'),
  activityController.deleteActivity
);

export const activityRoutes = router;

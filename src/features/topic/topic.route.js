import express from 'express';
import { authMiddleware } from '../../shared/globals/helpers/auth-middleware.js';
import { topicController } from './topic.controller.js';
import { createTopicSchema, updateTopicSchema } from './topic.validation.js';
import { validateZod } from '../../shared/globals/helpers/zodValidate.js';

const router = express.Router();

// Public routes
router.get('/', topicController.getAllTopics);
router.get('/:id', topicController.getTopicById);

// Admin only routes
router.use(authMiddleware.protect, authMiddleware.authorize('ADMIN'));
router.post('/', validateZod(createTopicSchema), topicController.createTopic);
router.patch('/:id', validateZod(updateTopicSchema), topicController.updateTopic);
router.delete('/:id', topicController.deleteTopic);

export const topicRoutes = router;
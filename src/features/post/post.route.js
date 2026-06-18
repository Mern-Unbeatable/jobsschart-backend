import express from 'express';
import { authMiddleware } from '../../shared/globals/helpers/auth-middleware.js';
import { postController } from './post.controller.js';
import { validateZod } from '../../shared/globals/helpers/zodValidate.js';
import { createPostSchema, updatePostSchema, commentSchema } from './post.validation.js';

const router = express.Router();

// ==================== PUBLIC ROUTES ====================
router.get('/', postController.getPosts);
router.get('/:id', postController.getPostById);
router.get('/:id/comments', postController.getComments);

// ==================== PROTECTED ROUTES (require authentication) ====================

// Post routes
router.post(
  '/',
  authMiddleware.protect,
  validateZod(createPostSchema),
  postController.createPost
);

router.patch(
  '/:id',
  authMiddleware.protect,
  validateZod(updatePostSchema),
  postController.updatePost
);

router.delete('/:id', authMiddleware.protect, postController.deletePost);

// Like routes (toggle like/unlike)
router.post('/:id/like', authMiddleware.protect, postController.toggleLike);

// Comment routes
router.post(
  '/:id/comments',
  authMiddleware.protect,
  validateZod(commentSchema),
  postController.addComment
);

router.patch(
  '/comments/:commentId',
  authMiddleware.protect,
  validateZod(commentSchema),
  postController.updateComment
);

router.delete('/comments/:commentId', authMiddleware.protect, postController.deleteComment);

export const postRoutes = router;
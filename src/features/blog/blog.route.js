import express from 'express';
import { authMiddleware } from '../../shared/globals/helpers/auth-middleware.js';
import { blogController } from './blog.controller.js';
import { uploadSingleImage, uploadMultipleImages } from '../../shared/upload/index.js';
import { validateZod } from '../../shared/globals/helpers/zodValidate.js';
import { createBlogSchema, updateBlogSchema, updateBlogCategorySchema } from './blog.validation.js';

const router = express.Router();

// Public routes (no authentication required)
router.get('/', blogController.getPublishedBlogs);
router.get('/slug/:slug', blogController.getBlogBySlug);
router.get('/categories', blogController.getAllCategories);
router.get('/categories/:id', blogController.getCategoryById);

router.use(authMiddleware.protect);

router.get('/mine', authMiddleware.authorize('ADMIN', 'CONSULTANT'), blogController.getMyBlogs);

router.get('/admin/drafts', authMiddleware.authorize('ADMIN'), blogController.getDraftBlogs);
router.get(
  '/admin/pending',
  authMiddleware.authorize('ADMIN'),
  blogController.getPendingApprovalBlogs,
);
router.get('/admin', authMiddleware.authorize('ADMIN'), blogController.getAdminBlogs);
router.get(
  '/admin/slug/:slug',
  authMiddleware.authorize('ADMIN'),
  blogController.getAdminBlogBySlug,
);

router.post(
  '/',
  authMiddleware.authorize('ADMIN', 'CONSULTANT'),
  uploadSingleImage('image', 'blogs'),
  validateZod(createBlogSchema),
  blogController.createBlog,
);

router.post(
  '/upload-content-image',
  authMiddleware.authorize('ADMIN', 'CONSULTANT'),
  uploadSingleImage('image', 'blogs'),
  blogController.uploadContentImage,
);

router.patch(
  '/:id',
  authMiddleware.authorize('ADMIN', 'CONSULTANT'),
  uploadMultipleImages('image', 'blogs'),
  validateZod(updateBlogSchema),
  blogController.updateBlog,
);

router.patch('/:id/approve', authMiddleware.authorize('ADMIN'), blogController.approveBlog);
router.patch('/:id/reject', authMiddleware.authorize('ADMIN'), blogController.rejectBlog);
router.patch('/:id/publish', authMiddleware.authorize('ADMIN'), blogController.publishBlog);
router.patch('/:id/unpublish', authMiddleware.authorize('ADMIN'), blogController.unpublishBlog);
router.delete('/:id', authMiddleware.authorize('ADMIN', 'CONSULTANT'), blogController.deleteBlog);

router.post('/categories', authMiddleware.authorize('ADMIN'), blogController.createCategory);
router.patch(
  '/categories/:id',
  authMiddleware.authorize('ADMIN'),
  validateZod(updateBlogCategorySchema),
  blogController.updateCategory,
);
router.delete('/categories/:id', authMiddleware.authorize('ADMIN'), blogController.deleteCategory);

export const blogRoutes = router;

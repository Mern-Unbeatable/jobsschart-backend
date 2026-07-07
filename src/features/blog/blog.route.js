import express from 'express';
import { authMiddleware } from '../../shared/globals/helpers/auth-middleware.js';
import { blogController } from './blog.controller.js';
import { uploadSingleImage, uploadMultipleImages } from '../../shared/upload/index.js';
import { validateZod } from '../../shared/globals/helpers/zodValidate.js';
import {
    createBlogSchema,
    updateBlogSchema,
    createBlogCategorySchema,
    updateBlogCategorySchema,
} from './blog.validation.js';

const router = express.Router();
router.get('/admin/drafts', blogController.getDraftBlogs);

// Public routes (no authentication required)
router.get('/', blogController.getPublishedBlogs);
router.get('/slug/:slug', blogController.getBlogBySlug);
router.get('/categories', blogController.getAllCategories);
router.get('/categories/:id', blogController.getCategoryById);


router.use(authMiddleware.protect, authMiddleware.authorize('ADMIN'));

router.get('/admin', blogController.getAdminBlogs);
router.get('/admin/slug/:slug', blogController.getAdminBlogBySlug);


router.post(
    '/',
    uploadSingleImage('image', 'blogs'),
    validateZod(createBlogSchema),
    blogController.createBlog
);

router.patch(
    '/:id',
    uploadMultipleImages('image', 'blogs'),
    validateZod(updateBlogSchema),
    blogController.updateBlog
);

router.delete('/:id', blogController.deleteBlog);


router.patch('/:id/publish', authMiddleware.protect, authMiddleware.authorize('ADMIN'), blogController.publishBlog);
router.patch('/:id/unpublish', authMiddleware.protect, authMiddleware.authorize('ADMIN'), blogController.unpublishBlog);



router.post('/categories', blogController.createCategory);
router.patch('/categories/:id', validateZod(updateBlogCategorySchema), blogController.updateCategory);
router.delete('/categories/:id', blogController.deleteCategory);

export const blogRoutes = router;
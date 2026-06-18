
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
router.get('/', blogController.getPublishedBlogs);
router.get('/slug/:slug', blogController.getBlogBySlug);
router.get('/categories', blogController.getAllCategories);
router.post(
    '/',
    uploadSingleImage('image', 'blogs'),
    authMiddleware.protect,
    authMiddleware.authorize('ADMIN'),
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
router.get('/categories/:id', blogController.getCategoryById);
router.post('/categories', blogController.createCategory);
router.patch('/categories/:id', validateZod(updateBlogCategorySchema), blogController.updateCategory);
router.delete('/categories/:id', blogController.deleteCategory);

export const blogRoutes = router;
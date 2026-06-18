import express from 'express';
import { authMiddleware } from '../../shared/globals/helpers/auth-middleware.js';
import { categoryController } from './category.controller.js';
import { createCategorySchema, updateCategorySchema } from './category.validation.js';
import { validateZod } from '../../shared/globals/helpers/zodValidate.js';

const router = express.Router();

// Public routes
router.get('/', categoryController.getAllCategories);
router.get('/:id', categoryController.getCategoryById);

// Admin only routes
router.use(authMiddleware.protect, authMiddleware.authorize('ADMIN'));
router.post('/', validateZod(createCategorySchema), categoryController.createCategory);
router.patch('/:id', validateZod(updateCategorySchema), categoryController.updateCategory);
router.delete('/:id', categoryController.deleteCategory);

export const categoryRoutes = router;

import express from 'express';
import { authMiddleware } from '../../shared/globals/helpers/auth-middleware.js';
import { productCategoryController } from './productCategory.controller.js';
import { createCategorySchema, updateCategorySchema } from './productCategory.validation.js';
import { validateZod } from '../../shared/globals/helpers/zodValidate.js';

const router = express.Router();

router.get('/', productCategoryController.getAllCategories);
router.get('/:id', productCategoryController.getCategoryById);
router.use(authMiddleware.protect, authMiddleware.authorize('ADMIN'));
router.post('/', validateZod(createCategorySchema), productCategoryController.createCategory);
router.patch('/:id', validateZod(updateCategorySchema), productCategoryController.updateCategory);
router.delete('/:id', productCategoryController.deleteCategory);

export const productCategoryRoutes = router;
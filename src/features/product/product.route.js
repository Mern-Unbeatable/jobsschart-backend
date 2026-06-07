
import express from 'express';
import { authMiddleware } from '../../shared/globals/helpers/auth-middleware.js';
import { productController } from './product.controller.js';
import { uploadMultipleImages, uploadSingleImage } from '../../shared/upload/index.js';
import { validateZod } from '../../shared/globals/helpers/zodValidate.js';
import { createProductSchema, updateProductSchema, updateStockSchema } from './product.validation.js';

const router = express.Router();

router.get('/', productController.getAllProducts);
router.get('/slug/:slug', productController.getProductBySlug);
router.get('/:id', productController.getProductById);

router.use(authMiddleware.protect, authMiddleware.authorize('ADMIN'));


router.post(
    '/',
    uploadMultipleImages('gallery', 'products', 10),
    validateZod(createProductSchema),
    productController.createProduct
);

router.patch(
    '/:id',
    uploadMultipleImages('gallery', 'products', 10),
    validateZod(updateProductSchema),
    productController.updateProduct
);

router.patch(
    '/:id/image',
    uploadSingleImage('image', 'products'),
    productController.updateProductImage
);

router.patch('/:id/stock', validateZod(updateStockSchema), productController.updateStock);
router.delete('/:id', productController.deleteProduct);


export const productRoutes = router;
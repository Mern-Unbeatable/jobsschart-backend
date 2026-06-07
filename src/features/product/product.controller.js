import { catchAsync } from '../../shared/globals/decorators/catch-async.js';
import { ResponseHandler } from '../../shared/globals/helpers/response.handler.js';
import { productService } from './product.service.js';
import { Logger } from '../../config/logger.js';

const log = new Logger('ProductController');

class ProductController {
    getAllProducts = catchAsync(async (req, res) => {
        const result = await productService.getAllProducts(req.query);
        ResponseHandler.success(res, { message: 'Products fetched', data: result });
    });

    getCategories = catchAsync(async (req, res) => {
        const categories = await productService.getCategories();
        ResponseHandler.success(res, { message: 'Categories fetched', data: { categories } });
    });

    getProductBySlug = catchAsync(async (req, res) => {
        const product = await productService.getProductBySlug(req.params.slug);
        ResponseHandler.success(res, { message: 'Product fetched', data: { product } });
    });

    getProductById = catchAsync(async (req, res) => {
        const product = await productService.getProductById(req.params.id);
        ResponseHandler.success(res, { message: 'Product fetched', data: { product } });
    });

    createProduct = catchAsync(async (req, res) => {
        log.info('Creating product, body:', JSON.stringify(req.body));
        const product = await productService.createProduct(req.body);
        ResponseHandler.created(res, { message: 'Product created', data: { product } });
    });

    updateProduct = catchAsync(async (req, res) => {
        const product = await productService.updateProduct(req.params.id, req.body);
        ResponseHandler.success(res, { message: 'Product updated', data: { product } });
    });

    updateProductImage = catchAsync(async (req, res) => {
        if (!req.body.image) {
            return res.status(400).json({ success: false, message: 'No image uploaded' });
        }
        const product = await productService.updateProduct(req.params.id, { gallery: [req.body.image] });
        ResponseHandler.success(res, { message: 'Product image updated', data: { product } });
    });

    updateStock = catchAsync(async (req, res) => {
        const product = await productService.updateStock(req.params.id, req.body.stock);
        ResponseHandler.success(res, { message: 'Stock updated', data: { product } });
    });

    deleteProduct = catchAsync(async (req, res) => {
        const result = await productService.deleteProduct(req.params.id);
        ResponseHandler.success(res, { message: 'Product deleted', data: result });
    });
}

export const productController = new ProductController();
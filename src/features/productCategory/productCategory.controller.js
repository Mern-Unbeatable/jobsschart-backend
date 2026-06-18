import { catchAsync } from '../../shared/globals/decorators/catch-async.js';
import { ResponseHandler } from '../../shared/globals/helpers/response.handler.js';
import { productCategoryService } from './productCategory.service.js';
import { Logger } from '../../config/logger.js';

const log = new Logger('ProductCategoryController');

class ProductCategoryController {
    getAllCategories = catchAsync(async (req, res) => {
        const result = await productCategoryService.getAllCategories(req.query);
        ResponseHandler.success(res, {
            message: 'Categories fetched successfully',
            data: result,
        });
    });

    getCategoryById = catchAsync(async (req, res) => {
        const category = await productCategoryService.getCategoryById(req.params.id);
        ResponseHandler.success(res, {
            message: 'Category fetched successfully',
            data: { category },
        });
    });

    createCategory = catchAsync(async (req, res) => {
        log.info(`Admin creating category: ${req.body.name}`);
        const category = await productCategoryService.createCategory(req.body);
        ResponseHandler.created(res, {
            message: 'Category created successfully',
            data: { category },
        });
    });

    updateCategory = catchAsync(async (req, res) => {
        log.info(`Admin updating category: ${req.params.id}`);
        const category = await productCategoryService.updateCategory(req.params.id, req.body);
        ResponseHandler.success(res, {
            message: 'Category updated successfully',
            data: { category },
        });
    });

    deleteCategory = catchAsync(async (req, res) => {
        log.info(`Admin deleting category: ${req.params.id}`);
        const result = await productCategoryService.deleteCategory(req.params.id);
        ResponseHandler.success(res, {
            message: result.message,
            data: { deletedId: req.params.id },
        });
    });
}

export const productCategoryController = new ProductCategoryController();
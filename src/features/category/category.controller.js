import { catchAsync } from '../../shared/globals/decorators/catch-async.js';
import { ResponseHandler } from '../../shared/globals/helpers/response.handler.js';
import { categoryService } from './category.service.js';
import { Logger } from '../../config/logger.js';

const log = new Logger('CategoryController');

class CategoryController {
    getAllCategories = catchAsync(async (req, res) => {
        const result = await categoryService.getAllCategories(req.query);
        ResponseHandler.success(res, {
            message: 'Categories fetched successfully',
            data: result,
        });
    });

    getCategoryById = catchAsync(async (req, res) => {
        const category = await categoryService.getCategoryById(req.params.id);
        ResponseHandler.success(res, {
            message: 'Category fetched successfully',
            data: { category },
        });
    });

    createCategory = catchAsync(async (req, res) => {
        log.info(`Creating category: ${req.body.name}`);
        const category = await categoryService.createCategory(req.body);
        ResponseHandler.created(res, {
            message: 'Category created successfully',
            data: { category },
        });
    });

    updateCategory = catchAsync(async (req, res) => {
        log.info(`Updating category: ${req.params.id}`);
        const category = await categoryService.updateCategory(req.params.id, req.body);
        ResponseHandler.success(res, {
            message: 'Category updated successfully',
            data: { category },
        });
    });

    deleteCategory = catchAsync(async (req, res) => {
        log.info(`Deleting category: ${req.params.id}`);
        const result = await categoryService.deleteCategory(req.params.id);
        ResponseHandler.success(res, {
            message: result.message,
            data: { deletedId: req.params.id },
        });
    });
}

export const categoryController = new CategoryController();
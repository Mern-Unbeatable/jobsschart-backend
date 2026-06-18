
import { catchAsync } from '../../shared/globals/decorators/catch-async.js';
import { ResponseHandler } from '../../shared/globals/helpers/response.handler.js';
import { blogService } from './blog.service.js';
import { blogCategoryService } from './blogCategory.service.js';
import { Logger } from '../../config/logger.js';

const log = new Logger('BlogController');

class BlogController {
    getPublishedBlogs = catchAsync(async (req, res) => {
        const result = await blogService.getPublishedBlogs(req.query);
        ResponseHandler.success(res, { message: 'Blogs fetched successfully', data: result });
    });

    getBlogBySlug = catchAsync(async (req, res) => {
        const blog = await blogService.getBlogBySlug(req.params.slug);
        ResponseHandler.success(res, { message: 'Blog fetched successfully', data: { blog } });
    });


    getAllCategories = catchAsync(async (req, res) => {
        const result = await blogCategoryService.getAllCategories(req.query);
        ResponseHandler.success(res, { message: 'Categories fetched successfully', data: result });
    });


    createBlog = catchAsync(async (req, res) => {
        console.log('body check', req.body)
        log.info(`Creating blog: ${req.body.title}`);
        const blog = await blogService.createBlog(req.body);
        ResponseHandler.created(res, { message: 'Blog created successfully', data: { blog } });
    });

    updateBlog = catchAsync(async (req, res) => {
        log.info(`Updating blog: ${req.params.id}`);
        const blog = await blogService.updateBlog(req.params.id, req.body);
        ResponseHandler.updated(res, { message: 'Blog updated successfully', data: { blog } });
    });

    deleteBlog = catchAsync(async (req, res) => {
        log.info(`Deleting blog: ${req.params.id}`);
        const result = await blogService.deleteBlog(req.params.id);
        ResponseHandler.success(res, { message: result.message, data: { deletedAt: new Date().toISOString() } });
    });

    getCategoryById = catchAsync(async (req, res) => {
        const category = await blogCategoryService.getCategoryById(req.params.id);
        ResponseHandler.success(res, { message: 'Category fetched successfully', data: { category } });
    });

    createCategory = catchAsync(async (req, res) => {
        log.info(`Creating category: ${req.body.name}`);
        const category = await blogCategoryService.createCategory(req.body);
        ResponseHandler.created(res, { message: 'Category created successfully', data: { category } });
    });

    updateCategory = catchAsync(async (req, res) => {
        log.info(`Updating category: ${req.params.id}`);
        const category = await blogCategoryService.updateCategory(req.params.id, req.body);
        ResponseHandler.updated(res, { message: 'Category updated successfully', data: { category } });
    });

    deleteCategory = catchAsync(async (req, res) => {
        log.info(`Deleting category: ${req.params.id}`);
        const result = await blogCategoryService.deleteCategory(req.params.id);
        ResponseHandler.success(res, { message: result.message, data: { deletedAt: new Date().toISOString() } });
    });
}

export const blogController = new BlogController();
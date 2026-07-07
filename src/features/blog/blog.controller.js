import { catchAsync } from '../../shared/globals/decorators/catch-async.js';
import { ResponseHandler } from '../../shared/globals/helpers/response.handler.js';
import { blogService } from './blog.service.js';
import { blogCategoryService } from './blogCategory.service.js';
import { Logger } from '../../config/logger.js';

const log = new Logger('BlogController');

class BlogController {
    // Get published blogs (public)
    getPublishedBlogs = catchAsync(async (req, res) => {
        const result = await blogService.getPublishedBlogs(req.query);
        ResponseHandler.success(res, {
            message: 'Blogs fetched successfully',
            data: result
        });
    });

    // Get all blogs for admin (including drafts)
    getAdminBlogs = catchAsync(async (req, res) => {
        const result = await blogService.getBlogsForAdmin(req.query);
        ResponseHandler.success(res, {
            message: 'Blogs fetched successfully',
            data: result
        });
    });

    // Get blog by slug (public - only published)
    getBlogBySlug = catchAsync(async (req, res) => {
        const blog = await blogService.getBlogBySlug(req.params.slug);
        ResponseHandler.success(res, {
            message: 'Blog fetched successfully',
            data: { blog }
        });
    });

    // Get blog by slug (admin - all statuses)
    getAdminBlogBySlug = catchAsync(async (req, res) => {
        const blog = await blogService.getBlogBySlugForAdmin(req.params.slug);
        ResponseHandler.success(res, {
            message: 'Blog fetched successfully',
            data: { blog }
        });
    });

    // Create blog
    createBlog = catchAsync(async (req, res) => {
        console.log('Creating blog with data:', req.body);
        log.info(`Creating blog: ${req.body.title}`);

        const blog = await blogService.createBlog({
            ...req.body,
            authorId: req.user?.id,
        });

        ResponseHandler.created(res, {
            message: `Blog ${blog.blog.status === 'PUBLISHED' ? 'published' : 'created as draft'} successfully`,
            data: { blog }
        });
    });

    // Update blog
    updateBlog = catchAsync(async (req, res) => {
        log.info(`Updating blog: ${req.params.id}`);
        const blog = await blogService.updateBlog(req.params.id, req.body);

        const statusMessage = blog.status === 'PUBLISHED'
            ? 'Blog published successfully'
            : blog.status === 'DRAFT'
                ? 'Blog saved as draft'
                : 'Blog updated successfully';

        ResponseHandler.updated(res, {
            message: statusMessage,
            data: { blog }
        });
    });

    // Delete blog
    deleteBlog = catchAsync(async (req, res) => {
        log.info(`Deleting blog: ${req.params.id}`);
        const result = await blogService.deleteBlog(req.params.id);
        ResponseHandler.success(res, {
            message: result.message,
            data: { deletedAt: new Date().toISOString() }
        });
    });

    // Category methods
    getAllCategories = catchAsync(async (req, res) => {
        const result = await blogCategoryService.getAllCategories(req.query);
        ResponseHandler.success(res, {
            message: 'Categories fetched successfully',
            data: result
        });
    });

    getCategoryById = catchAsync(async (req, res) => {
        const category = await blogCategoryService.getCategoryById(req.params.id);
        ResponseHandler.success(res, {
            message: 'Category fetched successfully',
            data: { category }
        });
    });

    createCategory = catchAsync(async (req, res) => {
        log.info(`Creating category: ${req.body.name}`);
        const category = await blogCategoryService.createCategory(req.body);
        ResponseHandler.created(res, {
            message: 'Category created successfully',
            data: { category }
        });
    });

    updateCategory = catchAsync(async (req, res) => {
        log.info(`Updating category: ${req.params.id}`);
        const category = await blogCategoryService.updateCategory(req.params.id, req.body);
        ResponseHandler.updated(res, {
            message: 'Category updated successfully',
            data: { category }
        });
    });

    deleteCategory = catchAsync(async (req, res) => {
        log.info(`Deleting category: ${req.params.id}`);
        const result = await blogCategoryService.deleteCategory(req.params.id);
        ResponseHandler.success(res, {
            message: result.message,
            data: { deletedAt: new Date().toISOString() }
        });
    });

    // Additional controller methods for draft management
    getDraftBlogs = catchAsync(async (req, res) => {
        const result = await blogService.getDraftBlogs(req.user?.id);
        ResponseHandler.success(res, {
            message: 'Draft blogs fetched successfully',
            data: result
        });
    });

    publishBlog = catchAsync(async (req, res) => {
        log.info(`Publishing blog: ${req.params.id}`);
        const blog = await blogService.publishBlog(req.params.id);
        ResponseHandler.updated(res, {
            message: 'Blog published successfully',
            data: { blog }
        });
    });

    unpublishBlog = catchAsync(async (req, res) => {
        log.info(`Unpublishing blog: ${req.params.id}`);
        const blog = await blogService.unpublishBlog(req.params.id);
        ResponseHandler.updated(res, {
            message: 'Blog moved to draft',
            data: { blog }
        });
    });



}

export const blogController = new BlogController();

import { prisma } from '../../config/db.js';
import { Logger } from '../../config/logger.js';
import { NotFoundError, ConflictError } from '../../shared/globals/helpers/error-handler.js';
import { generateSlug, makeSlugUnique } from '../../shared/utils/slug-utils.js';

const log = new Logger('BlogCategoryService');


class BlogCategoryService {
    async getAllCategories(queryParams = {}) {
        const page = parseInt(queryParams.page) || 1;
        const limit = Math.min(parseInt(queryParams.limit) || 50, 100);
        const skip = (page - 1) * limit;

        const where = {};
        if (queryParams.search) {
            where.name = { contains: queryParams.search, mode: 'insensitive' };
        }

        const sortField = queryParams.sortBy || 'name';
        const sortOrder = queryParams.sortOrder === 'desc' ? 'desc' : 'asc';

        const [categories, total] = await Promise.all([
            prisma.blogCategory.findMany({
                where,
                include: {
                    blogs: {
                        where: { status: 'PUBLISHED' },
                        select: {
                            id: true,
                            image: true,
                            slug: true,
                            status: true,
                            readTime: true,
                            publishedAt: true,
                            createdAt: true
                        },
                        take: 5,
                    },
                },
                orderBy: { [sortField]: sortOrder },
                skip,
                take: limit,
            }),
            prisma.blogCategory.count({ where }),
        ]);

        const categoriesWithCount = categories.map(category => ({
            ...category,
            blogCount: category.blogs.length,
        }));

        return { meta: { page, limit, total, totalPages: Math.ceil(total / limit) }, categories: categoriesWithCount };
    }

  async getCategoryById(id) {
    const category = await prisma.blogCategory.findUnique({
        where: { id },
        include: {
            blogs: {
                where: {
                    status: 'PUBLISHED',
                },
                orderBy: {
                    createdAt: 'desc',
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            avatar: true,
                        },
                    },
                },
            },
        },
    });

    if (!category) {
        throw new NotFoundError('Blog category not found');
    }

    return category;
}



    async createCategory(data) {

        const existing = await prisma.blogCategory.findFirst({
            where: { name: { equals: data.name, mode: 'insensitive' } },
        });
        if (existing) throw new ConflictError(`Category "${data.name}" already exists`);

        const category = await prisma.blogCategory.create({
            data: {
                name: data.name
            },
        });

        log.info(`Blog category created: ${category.id} — "${category.name}"`);
        return category;
    }

    async updateCategory(id, data) {
        const category = await prisma.blogCategory.findUnique({ where: { id } });
        if (!category) throw new NotFoundError('Blog category not found');

        const updateData = {};

        if (data.name && data.name !== category.name) {
            const existing = await prisma.blogCategory.findFirst({
                where: { name: { equals: data.name, mode: 'insensitive' }, NOT: { id } },
            });
            if (existing) throw new ConflictError(`Category "${data.name}" already exists`);
            updateData.name = data.name;

        }


        const updated = await prisma.blogCategory.update({
            where: { id },
            data: updateData,
        });

        log.info(`Blog category updated: ${id} — "${updated.name}"`);
        return updated;
    }

    async deleteCategory(id) {
        const category = await prisma.blogCategory.findUnique({ where: { id } });
        if (!category) throw new NotFoundError('Blog category not found');

        const blogCount = await prisma.blog.count({ where: { categoryId: id } });
        if (blogCount > 0) {
            throw new ConflictError(`Cannot delete category "${category.name}" because it has ${blogCount} blog(s).`);
        }

        await prisma.blogCategory.delete({ where: { id } });
        log.info(`Blog category deleted: ${id} — "${category.name}"`);
        return { success: true, message: 'Category deleted successfully' };
    }
}

export const blogCategoryService = new BlogCategoryService();
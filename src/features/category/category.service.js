import { prisma } from '../../config/db.js';
import { Logger } from '../../config/logger.js';
import {
    NotFoundError,
    ConflictError,
} from '../../shared/globals/helpers/error-handler.js';

const log = new Logger('CategoryService');

class CategoryService {
    async getAllCategories(queryParams = {}) {
        const page = parseInt(queryParams.page) || 1;
        const limit = Math.min(parseInt(queryParams.limit) || 50, 100);
        const skip = (page - 1) * limit;

        const where = {};

        if (queryParams.search) {
            where.name = {
                contains: queryParams.search,
                mode: 'insensitive'
            };
        }

        const orderBy = {};
        const sortField = queryParams.sortBy || 'name';
        const sortOrder = queryParams.sortOrder === 'desc' ? 'desc' : 'asc';
        orderBy[sortField] = sortOrder;

        const [categories, total] = await Promise.all([
            prisma.category.findMany({
                where,
                orderBy,
                skip,
                take: limit,
            }),
            prisma.category.count({ where }),
        ]);

        return {
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
            categories,
        };
    }

    async getCategoryById(id) {
        const category = await prisma.category.findUnique({
            where: { id },
        });

        if (!category) {
            throw new NotFoundError('Category not found');
        }

        return category;
    }

    async createCategory(data) {
        const existingCategory = await prisma.category.findFirst({
            where: {
                name: {
                    equals: data.name,
                    mode: 'insensitive',
                },
            },
        });

        if (existingCategory) {
            throw new ConflictError(`Category "${data.name}" already exists`);
        }

        const category = await prisma.category.create({
            data: {
                name: data.name.trim(),
            },
        });

        log.info(`Category created: ${category.id} — "${category.name}"`);
        return category;
    }

    async updateCategory(id, data) {
        const category = await prisma.category.findUnique({
            where: { id },
        });

        if (!category) {
            throw new NotFoundError('Category not found');
        }

        if (data.name && data.name !== category.name) {
            const existingCategory = await prisma.category.findFirst({
                where: {
                    name: {
                        equals: data.name,
                        mode: 'insensitive',
                    },
                    NOT: { id }
                },
            });

            if (existingCategory) {
                throw new ConflictError(`Category "${data.name}" already exists`);
            }
        }

        const updated = await prisma.category.update({
            where: { id },
            data: {
                name: data.name?.trim(),
            },
        });

        log.info(`Category updated: ${id} — "${updated.name}"`);
        return updated;
    }

    async deleteCategory(id) {
        const category = await prisma.category.findUnique({
            where: { id },
        });

        if (!category) {
            throw new NotFoundError('Category not found');
        }

        await prisma.category.delete({
            where: { id },
        });

        log.info(`Category deleted: ${id} — "${category.name}"`);
        return {
            success: true,
            message: `Category "${category.name}" deleted successfully`,
        };
    }
}

export const categoryService = new CategoryService();
import { prisma } from '../../config/db.js';
import { Logger } from '../../config/logger.js';
import {
    NotFoundError,
    ConflictError,
} from '../../shared/globals/helpers/error-handler.js';
import { expandI18n, jsonLocaleSearch } from '../../shared/services/translate.service.js';

const log = new Logger('CategoryService');

class CategoryService {
    async getAllCategories(queryParams = {}) {
        const page = parseInt(queryParams.page) || 1;
        const limit = Math.min(parseInt(queryParams.limit) || 50, 100);
        const skip = (page - 1) * limit;

        const where = {};

        if (queryParams.search) {
            where.OR = jsonLocaleSearch(['name'], queryParams.search);
        }

        const sortField = queryParams.sortBy === 'name' ? 'createdAt' : (queryParams.sortBy || 'createdAt');
        const sortOrder = queryParams.sortOrder === 'desc' ? 'desc' : 'asc';
        const orderBy = { [sortField]: sortOrder };

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
        const category = await prisma.category.create({
            data: {
                name: await expandI18n(data.name, { sourceLocale: data.sourceLang || 'en' }),
            },
        });

        log.info(`Category created: ${category.id}`);
        return category;
    }

    async updateCategory(id, data) {
        const category = await prisma.category.findUnique({
            where: { id },
        });

        if (!category) {
            throw new NotFoundError('Category not found');
        }

        const updated = await prisma.category.update({
            where: { id },
            data: {
                name: data.name
                    ? await expandI18n(data.name, { sourceLocale: data.sourceLang || 'en' })
                    : undefined,
            },
        });

        log.info(`Category updated: ${id}`);
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
            message: 'Category deleted successfully',
        };
    }
}

export const categoryService = new CategoryService();
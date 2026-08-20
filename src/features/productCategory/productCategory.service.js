import { prisma } from '../../config/db.js';
import { Logger } from '../../config/logger.js';
import {
    NotFoundError,
    ConflictError,
    BadRequestError,
} from '../../shared/globals/helpers/error-handler.js';
import { expandI18n, jsonLocaleSearch } from '../../shared/services/translate.service.js';

const log = new Logger('ProductCategoryService');

class ProductCategoryService {

    async getAllCategories(queryParams = {}) {
        const page = parseInt(queryParams.page) || 1;
        const limit = Math.min(parseInt(queryParams.limit) || 50, 100);
        const skip = (page - 1) * limit;

        const where = {};

        if (queryParams.search) {
            where.OR = jsonLocaleSearch(['name'], queryParams.search);
        }

        const orderBy = {};
        const sortField = queryParams.sortBy === 'name' ? 'createdAt' : (queryParams.sortBy || 'createdAt');
        const sortOrder = queryParams.sortOrder === 'desc' ? 'desc' : 'asc';
        orderBy[sortField] = sortOrder;

        const [categories, total] = await Promise.all([
            prisma.productCategory.findMany({
                where,
                include: {
                    products: {
                        where: { isActive: true },
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                            price: true,
                            stock: true,
                        },
                        take: 5,
                    },
                },
                orderBy,
                skip,
                take: limit,
            }),
            prisma.productCategory.count({ where }),
        ]);

        const categoriesWithCount = await Promise.all(
            categories.map(async (category) => {
                const productCount = await prisma.product.count({
                    where: {
                        productCategoryId: category.id,
                        isActive: true,
                    },
                });

                return {
                    ...category,
                    productCount,
                };
            })
        );

        return {
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
            categories: categoriesWithCount,
        };
    }

    async getCategoryById(id) {
        const category = await prisma.productCategory.findUnique({
            where: { id },
            include: {
                products: {
                    where: { isActive: true },
                    orderBy: { createdAt: 'desc' },
                },
            },
        });

        if (!category) {
            throw new NotFoundError('Product category not found');
        }

        const productCount = await prisma.product.count({
            where: {
                productCategoryId: category.id,
                isActive: true,
            },
        });

        return {
            ...category,
            productCount,
        };
    }

    async deleteCategory(id) {
        const category = await prisma.productCategory.findUnique({
            where: { id },
            include: {
                products: {
                    select: { id: true },
                    take: 1,
                },
            },
        });

        if (!category) {
            throw new NotFoundError('Product category not found');
        }

        // Check if category has products
        const productCount = await prisma.product.count({
            where: { productCategoryId: id },
        });

        if (productCount > 0) {
            throw new BadRequestError(
                `Cannot delete category because it has ${productCount} product(s). ` +
                'Please reassign or delete the products first.'
            );
        }

        await prisma.productCategory.delete({ where: { id } });
        log.info(`Category deleted: ${id} — "${category.name}"`);

        return {
            success: true,
            message: `Category "${category.name}" deleted successfully`,
        };
    }

    async createCategory(data) {
        const category = await prisma.productCategory.create({
            data: {
                name: await expandI18n(data.name, { sourceLocale: data.sourceLang || 'en' }),
            },
        });

        log.info(`Category created: ${category.id}`);
        return category;
    }

    async updateCategory(id, data) {
        const category = await prisma.productCategory.findUnique({
            where: { id },
            include: {
                products: {
                    take: 1,
                },
            },
        });

        if (!category) {
            throw new NotFoundError('Product category not found');
        }

        const updateData = {};

        // Update name if provided
        if (data.name) {
            updateData.name = await expandI18n(data.name, { sourceLocale: data.sourceLang || 'en' });
        }

        // If no updates, return existing category
        if (Object.keys(updateData).length === 0) {
            return category;
        }

        const updated = await prisma.productCategory.update({
            where: { id },
            data: updateData,
        });

        log.info(`Category updated: ${id} — "${updated.name}"`);
        return updated;
    }
}

export const productCategoryService = new ProductCategoryService();
import { prisma } from '../../config/db.js';
import { Logger } from '../../config/logger.js';
import { NotFoundError, ConflictError } from '../../shared/globals/helpers/error-handler.js';
import { generateSlug, makeSlugUnique } from '../../shared/utils/slug-utils.js';

const log = new Logger('ProductService');

class ProductService {

    async getAllProducts(queryParams = {}) {
        const page = parseInt(queryParams.page) || 1;
        const limit = Math.min(parseInt(queryParams.limit) || 20, 100);
        const skip = (page - 1) * limit;

        const where = { isActive: true };

        if (queryParams.productCategory) {
            where.productCategory = queryParams.productCategory;
        }

        if (queryParams.search) {
            where.OR = [
                { name: { contains: queryParams.search, mode: 'insensitive' } },
                { description: { contains: queryParams.search, mode: 'insensitive' } },
            ];
        }

        if (queryParams.minPrice || queryParams.maxPrice) {
            where.price = {};
            if (queryParams.minPrice) where.price.gte = Number(queryParams.minPrice);
            if (queryParams.maxPrice) where.price.lte = Number(queryParams.maxPrice);
        }

        const sortField = queryParams.sortBy || 'createdAt';
        const sortOrder = queryParams.sortOrder === 'asc' ? 'asc' : 'desc';

        const [products, total] = await Promise.all([
            prisma.product.findMany({
                where,
                orderBy: { [sortField]: sortOrder },
                skip,
                take: limit,
            }),
            prisma.product.count({ where }),
        ]);

        return { meta: { page, limit, total, totalPages: Math.ceil(total / limit) }, products };
    }

    async getProductById(id) {
        const product = await prisma.product.findUnique({
            where: { id },
        });
        if (!product) throw new NotFoundError('Product not found');
        return product;
    }

    async getProductBySlug(slug) {
        const product = await prisma.product.findUnique({
            where: { slug },
        });
        if (!product || !product.isActive) throw new NotFoundError('Product not found');
        return product;
    }

    async createProduct(data) {
        let slug = data.slug || generateSlug(data.name);

        slug = await makeSlugUnique(slug, {
            model: 'product',
            slugField: 'slug',
            excludeId: null
        });

        const product = await prisma.product.create({
            data: {
                name: data.name,
                slug,
                description: data.description,
                subTitle: data.subTitle || null,
                price: data.price,
                features: data.features || [],
                whatsInside: data.whatsInside || [],
                benefits: data.benefits || [],
                gallery: data.gallery || [],
                stock: data.stock ?? 0,
                isActive: data.isActive ?? true,
                productCategory: data.productCategory,
            },
        });

        log.info(`Product created: ${product.id} — "${product.name}"`);
        return product;
    }

    async updateProduct(id, data) {
        const product = await prisma.product.findUnique({
            where: { id }
        });
        if (!product) throw new NotFoundError('Product not found');

        const updateData = {};

        if (data.name) updateData.name = data.name;

        if (data.slug && data.slug !== product.slug) {
            updateData.slug = await makeSlugUnique(data.slug, {
                model: 'product',
                slugField: 'slug',
                excludeId: id
            });
        } else if (data.name && data.name !== product.name && !data.slug) {
            const newSlug = generateSlug(data.name);
            updateData.slug = await makeSlugUnique(newSlug, {
                model: 'product',
                slugField: 'slug',
                excludeId: id
            });
        }

        if (data.description !== undefined) updateData.description = data.description;
        if (data.subTitle !== undefined) updateData.subTitle = data.subTitle;
        if (data.price !== undefined) updateData.price = data.price;
        if (data.features !== undefined) updateData.features = data.features;
        if (data.whatsInside !== undefined) updateData.whatsInside = data.whatsInside;
        if (data.benefits !== undefined) updateData.benefits = data.benefits;
        if (data.gallery !== undefined) updateData.gallery = data.gallery;
        if (data.stock !== undefined) updateData.stock = data.stock;
        if (data.isActive !== undefined) updateData.isActive = data.isActive;
        if (data.productCategory !== undefined) updateData.productCategory = data.productCategory;

        const updated = await prisma.product.update({
            where: { id },
            data: updateData,
        });

        log.info(`Product updated: ${id}`);
        return updated;
    }

    async updateStock(id, stock) {
        const product = await prisma.product.findUnique({
            where: { id }
        });
        if (!product) throw new NotFoundError('Product not found');

        return prisma.product.update({
            where: { id },
            data: { stock: Number(stock) }
        });
    }

    async deleteProduct(id) {
        const product = await prisma.product.findUnique({
            where: { id }
        });
        if (!product) throw new NotFoundError('Product not found');

        const orderCount = await prisma.orderItem.count({
            where: { productId: id }
        });

        if (orderCount > 0) {
            throw new ConflictError(`Cannot delete — has ${orderCount} order(s). Deactivate instead.`);
        }

        await prisma.product.delete({ where: { id } });
        log.info(`Product deleted: ${id}`);
        return { success: true };
    }

    async getCategories() {
        const categories = await prisma.product.groupBy({
            by: ['productCategory'],
            where: { isActive: true },
            _count: { _all: true },
        });

        return categories.map(cat => ({
            name: cat.productCategory,
            productCount: cat._count._all,
        }));
    }
}

export const productService = new ProductService();
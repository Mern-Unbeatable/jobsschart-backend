
import { prisma } from '../../config/db.js';
import { Logger } from '../../config/logger.js';
import { NotFoundError, ConflictError } from '../../shared/globals/helpers/error-handler.js';
import PrismaQueryBuilder from '../../shared/globals/helpers/query-builder.js';
import { generateSlug, makeSlugUnique } from '../../shared/utils/slug-utils.js';

const log = new Logger('BlogService');

class BlogService {

   async getPublishedBlogs(queryParams = {}) {
    const {
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        categoryId,
        category, 
        userId,
        search,
        isFeatured, 
        tag,       
    } = queryParams;

  
    const where = {
        status: 'PUBLISHED',
    };

    // Filter by category ID
    if (categoryId) {
        where.categoryId = categoryId;
    }

    // Filter by category name
    if (category) {
        where.category = {
            name: { contains: category, mode: 'insensitive' }
        };
    }

    // Filter by user ID
    if (userId) {
        where.userId = userId;
    }

    // Filter by featured status
    if (isFeatured !== undefined) {
        where.isFeatured = isFeatured === 'true';
    }

    // Filter by tag
    if (tag) {
        where.tags = { has: tag };
    }

    // Handle search
    if (search) {
        const searchTerm = search.trim();
        where.OR = [
            { title: { contains: searchTerm, mode: 'insensitive' } },
            { content: { contains: searchTerm, mode: 'insensitive' } },
            { excerpt: { contains: searchTerm, mode: 'insensitive' } },
            { slug: { contains: searchTerm.replace(/\s+/g, '-'), mode: 'insensitive' } }
        ];
    }

    // Handle pagination
    const take = Math.min(parseInt(limit) || 20, 100);
    const skip = (parseInt(page) - 1) * take;

    // Handle sorting
    const orderBy = [];
    const validSortFields = ['createdAt', 'updatedAt', 'publishedAt', 'title', 'readTime'];
    if (validSortFields.includes(sortBy)) {
        orderBy.push({ [sortBy]: sortOrder === 'asc' ? 'asc' : 'desc' });
    } else {
        orderBy.push({ publishedAt: 'desc' });
    }

    // Execute query
    const [blogs, total] = await Promise.all([
        prisma.blog.findMany({
            where,
            orderBy,
            skip,
            take,
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        avatar: true,
                        bio: true,
                    }
                },
                category: {
                    select: {
                        id: true,
                        name: true,
                    }
                }
            }
        }),
        prisma.blog.count({ where })
    ]);


    return {
        meta: {
            page: parseInt(page),
            limit: take,
            total,
            totalPages: Math.ceil(total / take)
        },
        blogs: blogs,
    };
}
    async getBlogBySlug(slug, shouldIncrementViews = true) {
        let blog = await prisma.blog.findUnique({
            where: { slug },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        avatar: true,
                        bio: true
                    }
                },
                category: {
                    select: {
                        id: true,
                        name: true
                    }
                },
            },
        });

        if (!blog) {
            throw new NotFoundError('Blog not found');
        }

        if (blog.status !== 'PUBLISHED') {
            throw new NotFoundError('Blog not found');
        }

        // Increment views if the field exists
        if (shouldIncrementViews) {
            try {
                await prisma.blog.update({
                    where: { id: blog.id },
                    data: { views: { increment: 1 } },
                });


                blog = {
                    ...blog,
                    views: (blog.views || 0) + 1
                };
            } catch (error) {
                console.log('Views increment failed (field might not exist):', error.message);
            }
        }

        return blog;
    }
    async createBlog(data) {
        console.log('blog data check this ', data);

        let slug = data.slug || generateSlug(data.title);

        // Make slug unique
        slug = await makeSlugUnique(slug, {
            model: 'blog',
            slugField: 'slug',
            excludeId: null
        });

        // Calculate read time
        const wordsPerMinute = 200;
        const wordCount = data.content?.trim().split(/\s+/).length || 0;
        const readTime = Math.max(1, Math.ceil(wordCount / wordsPerMinute));

        // Validate category if provided
        if (data.categoryId) {
            const category = await prisma.blogCategory.findUnique({
                where: { id: data.categoryId },
            });
            if (!category) throw new NotFoundError('Blog category not found');
        }

        // Create blog with all fields
        const blog = await prisma.blog.create({
            data: {
                title: data.title,
                slug,
                content: data.content,
                excerpt: data.excerpt || null,
                tags: data.tags || [],
                metaTitle: data.metaTitle || null,
                metaDescription: data.metaDescription || null,
                isFeatured: data.isFeatured || false,
                status: data.status || 'DRAFT',
                image: data.image || null,
                readTime: readTime,
                categoryId: data.categoryId || null,
                publishedAt: data.status === 'PUBLISHED' ? new Date() : null,
                userId: data.authorId,
            },
            include: {
                category: true,
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                }
            },
        });

        log.info(`Blog created: ${blog.id} — "${blog.title}"`);
        return { blog };
    }
    async updateBlog(id, data) {
        const blog = await prisma.blog.findUnique({
            where: { id },
            include: { user: true, category: true }
        });
        if (!blog) throw new NotFoundError('Blog not found');

        const updateData = {};

        // Handle slug update
        if (data.slug && data.slug !== blog.slug) {
            const slugTaken = await prisma.blog.findFirst({
                where: { slug: data.slug, NOT: { id } },
            });
            if (slugTaken) throw new ConflictError(`Slug "${data.slug}" is already in use`);
            updateData.slug = data.slug;
        } else if (data.title && !data.slug) {
            let newSlug = generateSlug(data.title);
            newSlug = await makeSlugUnique(newSlug, {
                model: 'blog',
                slugField: 'slug',
                excludeId: id
            });
            updateData.slug = newSlug;
        }

        // Update read time based on content
        if (data.content) {
            const wordsPerMinute = 200;
            const wordCount = data.content.trim().split(/\s+/).length;
            updateData.readTime = Math.max(1, Math.ceil(wordCount / wordsPerMinute));
        }

        // Handle publish status
        let publishedAt = blog.publishedAt;
        if (data.status === 'PUBLISHED' && blog.status !== 'PUBLISHED') {
            publishedAt = new Date();
            updateData.publishedAt = publishedAt;
        } else if (data.status === 'DRAFT' && blog.status === 'PUBLISHED') {
            updateData.publishedAt = null;
        }

        // Update only fields that exist in your schema
        if (data.image !== undefined) updateData.image = data.image;
        if (data.featuredImage !== undefined) updateData.image = data.featuredImage;
        if (data.status !== undefined) updateData.status = data.status;
        if (data.categoryId !== undefined) {
            if (data.categoryId) {
                const category = await prisma.blogCategory.findUnique({
                    where: { id: data.categoryId },
                });
                if (!category) throw new NotFoundError('Blog category not found');
            }
            updateData.categoryId = data.categoryId || null;
        }

        // Validate category if it exists in updateData
        if (updateData.categoryId) {
            const category = await prisma.blogCategory.findUnique({
                where: { id: updateData.categoryId },
            });
            if (!category) throw new NotFoundError('Blog category not found');
        }

        const updated = await prisma.blog.update({
            where: { id },
            data: updateData,
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                },
                category: true
            },
        });

        log.info(`Blog updated: ${id}`);
        return {
            ...updated,
            title: data.title || blog.title,
            content: data.content,
            excerpt: data.excerpt,
            tags: data.tags,
            metaTitle: data.metaTitle,
            metaDescription: data.metaDescription,
            isFeatured: data.isFeatured,
            featuredImage: updated.image
        };
    }

    async deleteBlog(id) {
        const blog = await prisma.blog.findUnique({ where: { id } });
        if (!blog) throw new NotFoundError('Blog not found');

        await prisma.blog.delete({ where: { id } });
        log.info(`Blog deleted: ${id} — "${blog.title}"`);
        return { success: true, message: 'Blog deleted successfully' };
    }


}

export const blogService = new BlogService();
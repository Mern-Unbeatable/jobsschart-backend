import { prisma } from '../../config/db.js';
import { Logger } from '../../config/logger.js';
import { NotFoundError, ConflictError } from '../../shared/globals/helpers/error-handler.js';
import { generateSlug, makeSlugUnique } from '../../shared/utils/slug-utils.js';

const log = new Logger('BlogService');

class BlogService {

    // Get published blogs for public view
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
            status: 'PUBLISHED', // Only show published blogs
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
        const pageNumber = Math.max(parseInt(page) || 1, 1);
        const take = Math.min(parseInt(limit) || 20, 100);
        const skip = (pageNumber - 1) * take;

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
                page: pageNumber,
                limit: take,
                total,
                totalPages: Math.ceil(total / take)
            },
            blogs: blogs,
        };
    }

    // Get all blogs for admin (including drafts)
    async getBlogsForAdmin(queryParams = {}) {
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
            status, // Status filter for admin
        } = queryParams;

        const where = {};

        // Filter by status (DRAFT, PUBLISHED, ARCHIVED)
        if (status) {
            if (['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(status)) {
                where.status = status;
            }
        }

        if (categoryId) {
            where.categoryId = categoryId;
        }

        if (category) {
            where.category = {
                name: { contains: category, mode: 'insensitive' }
            };
        }

        if (userId) {
            where.userId = userId;
        }

        if (isFeatured !== undefined) {
            where.isFeatured = isFeatured === 'true' || isFeatured === true;
        }

        if (tag) {
            where.tags = { has: tag };
        }

        if (search) {
            const searchTerm = search.trim();
            where.OR = [
                { title: { contains: searchTerm, mode: 'insensitive' } },
                { content: { contains: searchTerm, mode: 'insensitive' } },
                { excerpt: { contains: searchTerm, mode: 'insensitive' } },
                { slug: { contains: searchTerm.replace(/\s+/g, '-'), mode: 'insensitive' } }
            ];
        }

        const pageNumber = Math.max(parseInt(page) || 1, 1);
        const take = Math.min(parseInt(limit) || 20, 100);
        const skip = (pageNumber - 1) * take;

        const orderBy = [];
        const validSortFields = ['createdAt', 'updatedAt', 'publishedAt', 'title', 'readTime', 'status'];
        if (validSortFields.includes(sortBy)) {
            orderBy.push({ [sortBy]: sortOrder === 'asc' ? 'asc' : 'desc' });
        } else {
            orderBy.push({ updatedAt: 'desc' });
        }

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
                page: pageNumber,
                limit: take,
                total,
                totalPages: Math.ceil(total / take)
            },
            blogs,
        };
    }

    // Get blog by slug for public (only published)
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

        // Only allow access to published blogs
        if (blog.status !== 'PUBLISHED') {
            throw new NotFoundError('Blog not found');
        }

        // Increment views
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
                console.log('Views increment failed:', error.message);
            }
        }

        return blog;
    }

    // Get blog by slug for admin (can see all statuses)
    async getBlogBySlugForAdmin(slug) {
        const blog = await prisma.blog.findUnique({
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

        return blog;
    }

    // Create a new blog
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

        // Determine if blog should be published
        const status = data.status || 'DRAFT';
        const publishedAt = status === 'PUBLISHED' ? new Date() : null;

        // Create blog with all fields
        const blog = await prisma.blog.create({
            data: {
                title: data.title,
                slug,
                content: data.content || '',
                excerpt: data.excerpt || null,
                tags: data.tags || [],
                metaTitle: data.metaTitle || null,
                metaDescription: data.metaDescription || null,
                isFeatured: data.isFeatured || false,
                status: status,
                image: data.image || null,
                readTime: readTime,
                categoryId: data.categoryId || null,
                publishedAt: publishedAt,
                userId: data.authorId || null,
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

        log.info(`Blog created: ${blog.id} — "${blog.title}" (Status: ${blog.status})`);
        return { blog };
    }

    // Update an existing blog
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

        // Update basic fields
        if (data.title !== undefined) updateData.title = data.title;
        if (data.content !== undefined) updateData.content = data.content;
        if (data.excerpt !== undefined) updateData.excerpt = data.excerpt;
        if (data.tags !== undefined) updateData.tags = data.tags;
        if (data.metaTitle !== undefined) updateData.metaTitle = data.metaTitle;
        if (data.metaDescription !== undefined) updateData.metaDescription = data.metaDescription;
        if (data.isFeatured !== undefined) updateData.isFeatured = data.isFeatured;
        if (data.image !== undefined) updateData.image = data.image;

        // Handle status changes and publishedAt
        if (data.status !== undefined) {
            // Changing status to PUBLISHED
            if (data.status === 'PUBLISHED' && blog.status !== 'PUBLISHED') {
                updateData.publishedAt = new Date();
            }
            // Changing status from PUBLISHED to something else
            else if (data.status !== 'PUBLISHED' && blog.status === 'PUBLISHED') {
                updateData.publishedAt = null;
            }
            // If status is being updated to the same value, don't change publishedAt
            else if (data.status === blog.status) {
                // Keep existing publishedAt
                updateData.publishedAt = blog.publishedAt;
            }

            updateData.status = data.status;
        }

        // Handle category update
        if (data.categoryId !== undefined) {
            if (data.categoryId) {
                const category = await prisma.blogCategory.findUnique({
                    where: { id: data.categoryId },
                });
                if (!category) throw new NotFoundError('Blog category not found');
            }
            updateData.categoryId = data.categoryId || null;
        }

        // Update the blog
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

        log.info(`Blog updated: ${id} — Status: ${updated.status}`);
        return updated;
    }

    // Delete a blog
    async deleteBlog(id) {
        const blog = await prisma.blog.findUnique({ where: { id } });
        if (!blog) throw new NotFoundError('Blog not found');

        await prisma.blog.delete({ where: { id } });
        log.info(`Blog deleted: ${id} — "${blog.title}"`);
        return { success: true, message: 'Blog deleted successfully' };
    }

    // Additional utility methods for working with drafts
    async getDraftBlogs(adminId) {
        return await this.getBlogsForAdmin({
            status: 'DRAFT',
            userId: adminId
        });
    }

    async publishBlog(id) {
        return await this.updateBlog(id, { status: 'PUBLISHED' });
    }

    async unpublishBlog(id) {
        return await this.updateBlog(id, { status: 'DRAFT' });
    }


}

export const blogService = new BlogService();
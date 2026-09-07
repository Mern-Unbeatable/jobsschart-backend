import { prisma } from '../../config/db.js';
import { Logger } from '../../config/logger.js';
import { NotFoundError, ConflictError } from '../../shared/globals/helpers/error-handler.js';
import { generateSlug, makeSlugUnique } from '../../shared/utils/slug-utils.js';
import {
  expandI18n,
  jsonLocaleSearch,
  pickSourceText,
} from '../../shared/services/translate.service.js';

const log = new Logger('BlogService');

function normalizeImageArray(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

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
        OR: jsonLocaleSearch(['name'], category),
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
        ...jsonLocaleSearch(['title', 'content', 'excerpt'], searchTerm),
        { slug: { contains: searchTerm.replace(/\s+/g, '-'), mode: 'insensitive' } },
      ];
    }

    // Handle pagination
    const pageNumber = Math.max(parseInt(page) || 1, 1);
    const take = Math.min(parseInt(limit) || 20, 100);
    const skip = (pageNumber - 1) * take;

    // Handle sorting
    const orderBy = [];
    const validSortFields = ['createdAt', 'updatedAt', 'publishedAt', 'readTime'];
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
              role: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.blog.count({ where }),
    ]);

    return {
      meta: {
        page: pageNumber,
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
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
      userRole,
      search,
      isFeatured,
      tag,
      status,
    } = queryParams;

    const where = {};

    // Filter by status (DRAFT, PENDING_APPROVAL, PUBLISHED, REJECTED, ARCHIVED)
    if (status) {
      if (['DRAFT', 'PENDING_APPROVAL', 'PUBLISHED', 'REJECTED', 'ARCHIVED'].includes(status)) {
        where.status = status;
      }
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (category) {
      where.category = {
        OR: jsonLocaleSearch(['name'], category),
      };
    }

    // Build user relation filter (supports userId and/or userRole independently)
    const userFilter = {};
    if (userId) userFilter.id = userId;
    if (userRole) userFilter.role = userRole;
    if (Object.keys(userFilter).length > 0) {
      where.user = userFilter;
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
        ...jsonLocaleSearch(['title', 'content', 'excerpt'], searchTerm),
        { slug: { contains: searchTerm.replace(/\s+/g, '-'), mode: 'insensitive' } },
      ];
    }

    const pageNumber = Math.max(parseInt(page) || 1, 1);
    const take = Math.min(parseInt(limit) || 20, 100);
    const skip = (pageNumber - 1) * take;

    const orderBy = [];
    const validSortFields = ['createdAt', 'updatedAt', 'publishedAt', 'readTime', 'status'];
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
              role: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.blog.count({ where }),
    ]);

    return {
      meta: {
        page: pageNumber,
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
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
            bio: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
          },
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
          views: (blog.views || 0) + 1,
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
            bio: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
          },
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
    const sourceLocale = data.sourceLang || 'en';
    const title = await expandI18n(data.title, { sourceLocale });
    const content =
      data.content != null ? await expandI18n(data.content, { html: true, sourceLocale }) : null;
    const excerpt = data.excerpt != null ? await expandI18n(data.excerpt, { sourceLocale }) : null;
    const metaTitle =
      data.metaTitle != null ? await expandI18n(data.metaTitle, { sourceLocale }) : null;
    const metaDescription =
      data.metaDescription != null
        ? await expandI18n(data.metaDescription, { sourceLocale })
        : null;

    let slug = data.slug || generateSlug(title);

    // Make slug unique
    slug = await makeSlugUnique(slug, {
      model: 'blog',
      slugField: 'slug',
      excludeId: null,
    });

    // Calculate read time
    const wordsPerMinute = 200;
    const wordCount = pickSourceText(content).trim().split(/\s+/).filter(Boolean).length || 0;
    const readTime = Math.max(1, Math.ceil(wordCount / wordsPerMinute));

    // Validate category if provided
    if (data.categoryId) {
      const category = await prisma.blogCategory.findUnique({
        where: { id: data.categoryId },
      });
      if (!category) throw new NotFoundError('Blog category not found');
    }

    // Determine status
    const requestedStatus = data.status;
    let status = 'DRAFT';

    if (data.authorRole === 'CONSULTANT') {
      status = 'PENDING_APPROVAL';
    } else if (data.authorRole === 'ADMIN') {
      status = requestedStatus || 'PUBLISHED';
    } else if (requestedStatus) {
      status = requestedStatus;
    }

    const publishedAt = status === 'PUBLISHED' ? new Date() : null;

    // Create blog with all fields
    const blog = await prisma.blog.create({
      data: {
        title,
        slug,
        content: content || { en: '', nl: '' },
        excerpt,
        tags: data.tags || [],
        metaTitle,
        metaDescription,
        isFeatured: data.isFeatured || false,
        status: status,
        image: normalizeImageArray(data.image),
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
            email: true,
          },
        },
      },
    });

    return { blog };
  }

  // Update an existing blog
  async updateBlog(id, data) {
    const blog = await prisma.blog.findUnique({
      where: { id },
      include: { user: true, category: true },
    });
    if (!blog) throw new NotFoundError('Blog not found');

    const sourceLocale = data.sourceLang || 'en';
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
        excludeId: id,
      });
      updateData.slug = newSlug;
    }

    // Update read time based on content
    if (data.content) {
      const wordsPerMinute = 200;
      const wordCount = pickSourceText(data.content).trim().split(/\s+/).filter(Boolean).length;
      updateData.readTime = Math.max(1, Math.ceil(wordCount / wordsPerMinute));
    }

    // Update basic fields
    if (data.title !== undefined) updateData.title = await expandI18n(data.title, { sourceLocale });
    if (data.content !== undefined)
      updateData.content = await expandI18n(data.content, { html: true, sourceLocale });
    if (data.excerpt !== undefined)
      updateData.excerpt =
        data.excerpt == null ? null : await expandI18n(data.excerpt, { sourceLocale });
    if (data.tags !== undefined) updateData.tags = data.tags;
    if (data.metaTitle !== undefined)
      updateData.metaTitle =
        data.metaTitle == null ? null : await expandI18n(data.metaTitle, { sourceLocale });
    if (data.metaDescription !== undefined) {
      updateData.metaDescription =
        data.metaDescription == null
          ? null
          : await expandI18n(data.metaDescription, { sourceLocale });
    }
    if (data.isFeatured !== undefined) updateData.isFeatured = data.isFeatured;
    if (data.image !== undefined) updateData.image = normalizeImageArray(data.image);

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
            email: true,
          },
        },
        category: true,
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
      userId: adminId,
    });
  }

  async approveBlog(id) {
    return await this.updateBlog(id, { status: 'PUBLISHED' });
  }

  async rejectBlog(id) {
    return await this.updateBlog(id, { status: 'REJECTED' });
  }

  async publishBlog(id) {
    return await this.updateBlog(id, { status: 'PUBLISHED' });
  }

  async unpublishBlog(id) {
    return await this.updateBlog(id, { status: 'DRAFT' });
  }
}

export const blogService = new BlogService();

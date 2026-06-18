import { prisma } from '../../config/db.js';
import { Logger } from '../../config/logger.js';
import { NotFoundError, ForbiddenError } from '../../shared/globals/helpers/error-handler.js';

const log = new Logger('PostService');

class PostService {
  // ==================== POST CRUD ====================

  async createPost(userId, data) {
    const post = await prisma.post.create({
      data: {
        userId,
        title: data.title || null,
        content: data.content,
        category: data.category || null,
        subCategory: data.subCategory || null,
        postType: data.postType || 'THOUGHT',
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        _count: {
          select: {
            comments: true,
            likes: true,
          },
        },
      },
    });

    log.info(`Post created: ${post.id} by user ${userId}`);
    return post;
  }

async getPosts(queryParams = {}, currentUserId = null) {
  const {
    page = 1,
    limit = 20,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    userId,
    search,
    postType,
    category,        // New: filter by category
    subCategory,     // New: filter by subCategory
    startDate,       // New: filter by date range
    endDate,         // New: filter by date range
    minLikes,        // New: filter by minimum likes
    maxLikes,        // New: filter by maximum likes
    minViews,        // New: filter by minimum views
    maxViews,        // New: filter by maximum views
  } = queryParams;

  const where = {
    isDeleted: false,
  };

  // Basic filters
  if (userId) where.userId = userId;
  if (postType) where.postType = postType;
  
  // Category and SubCategory filters
  if (category) {
    where.category = {
      contains: category,
      mode: 'insensitive',
    };
  }
  
  if (subCategory) {
    where.subCategory = {
      contains: subCategory,
      mode: 'insensitive',
    };
  }

  // Search filter (title and content)
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { content: { contains: search, mode: 'insensitive' } },
    ];
  }

  // Date range filter
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) {
      where.createdAt.gte = new Date(startDate);
    }
    if (endDate) {
      where.createdAt.lte = new Date(endDate);
    }
  }

  // Likes count filter
  if (minLikes !== undefined || maxLikes !== undefined) {
    where.likesCount = {};
    if (minLikes !== undefined) {
      where.likesCount.gte = parseInt(minLikes);
    }
    if (maxLikes !== undefined) {
      where.likesCount.lte = parseInt(maxLikes);
    }
  }

  // Views count filter
  if (minViews !== undefined || maxViews !== undefined) {
    where.views = {};
    if (minViews !== undefined) {
      where.views.gte = parseInt(minViews);
    }
    if (maxViews !== undefined) {
      where.views.lte = parseInt(maxViews);
    }
  }

  const take = Math.min(parseInt(limit) || 20, 100);
  const skip = (parseInt(page) - 1) * take;

  const orderBy = [];
  const validSortFields = ['createdAt', 'updatedAt', 'likesCount', 'views', 'title'];
  if (validSortFields.includes(sortBy)) {
    orderBy.push({ [sortBy]: sortOrder === 'asc' ? 'asc' : 'desc' });
  } else {
    orderBy.push({ createdAt: 'desc' });
  }

  // Get posts with their relations
  const [posts, total] = await Promise.all([
    prisma.post.findMany({
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
          },
        },
        // Include recent comments (limit to 3 per post for preview)
        comments: {
          take: 3,
          orderBy: {
            createdAt: 'desc',
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
              },
            },
          },
        },
        // Include likes with user info
        likes: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
              },
            },
          },
        },
        _count: {
          select: {
            comments: true,
            likes: true,
          },
        },
      },
    }),
    prisma.post.count({ where }),
  ]);


  return {
    meta: {
      page: parseInt(page),
      limit: take,
      total,
      totalPages: Math.ceil(total / take),
     
    },
    posts: posts,
  };
}
  async getPostById(postId, currentUserId = null) {
    const post = await prisma.post.findFirst({
      where: {
        id: postId,
        isDeleted: false,
      },
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
        comments: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
        likes: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
              },
            },
          },
        },
        _count: {
          select: {
            comments: true,
            likes: true,
          },
        },
      },
    });

    if (!post) {
      throw new NotFoundError('Post not found');
    }

    // Increment views
    await prisma.post.update({
      where: { id: postId },
      data: { views: { increment: 1 } },
    });

    // Check if current user has liked
    let userLiked = false;
    if (currentUserId) {
      userLiked = post.likes.some(like => like.userId === currentUserId);
    }

    return {
      ...post,
      userLiked,
      likesList: post.likes.map(like => like.user),
    };
  }

  async updatePost(postId, userId, data) {
    const post = await prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
    });

    if (!post) {
      throw new NotFoundError('Post not found');
    }

    if (post.userId !== userId) {
      throw new ForbiddenError('You can only edit your own posts');
    }

    const updatedPost = await prisma.post.update({
      where: { id: postId },
      data: {
        title: data.title !== undefined ? data.title : undefined,
        content: data.content !== undefined ? data.content : undefined,
        category: data.category !== undefined ? data.category : undefined,
        subCategory: data.subCategory !== undefined ? data.subCategory : undefined,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        comments: {
          take: 5,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
              },
            },
          },
        },
        likes: {
          take: 10,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
              },
            },
          },
        },
        _count: {
          select: {
            comments: true,
            likes: true,
          },
        },
      },
    });

    log.info(`Post updated: ${postId} by user ${userId}`);
    return updatedPost;
  }

  async deletePost(postId, userId) {
    const post = await prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
    });

    if (!post) {
      throw new NotFoundError('Post not found');
    }

    if (post.userId !== userId) {
      throw new ForbiddenError('You can only delete your own posts');
    }

    const deletedPost = await prisma.post.update({
      where: { id: postId },
      data: { isDeleted: true },
    });

    log.info(`Post deleted: ${postId} by user ${userId}`);
    return { success: true, message: 'Post deleted successfully' };
  }

  // ==================== LIKES TOGGLE ====================

  async toggleLike(postId, userId) {
    const post = await prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
    });

    if (!post) {
      throw new NotFoundError('Post not found');
    }

    const existingLike = await prisma.postLike.findUnique({
      where: {
        postId_userId: {
          postId,
          userId,
        },
      },
    });

    if (existingLike) {
      // Unlike: remove like
      await prisma.$transaction([
        prisma.postLike.delete({
          where: {
            postId_userId: {
              postId,
              userId,
            },
          },
        }),
        prisma.post.update({
          where: { id: postId },
          data: { likesCount: { decrement: 1 } },
        }),
      ]);

      log.info(`User ${userId} unliked post ${postId}`);
      return { liked: false, likesCount: post.likesCount - 1 };
    } else {
      // Like: add like
      await prisma.$transaction([
        prisma.postLike.create({
          data: {
            postId,
            userId,
          },
        }),
        prisma.post.update({
          where: { id: postId },
          data: { likesCount: { increment: 1 } },
        }),
      ]);

      log.info(`User ${userId} liked post ${postId}`);
      return { liked: true, likesCount: post.likesCount + 1 };
    }
  }

  async getLikeStatus(postId, userId) {
    if (!userId) return { liked: false };

    const like = await prisma.postLike.findUnique({
      where: {
        postId_userId: {
          postId,
          userId,
        },
      },
    });

    return { liked: !!like };
  }

  // ==================== COMMENTS ====================

  async addComment(postId, userId, content) {
    const post = await prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
    });

    if (!post) {
      throw new NotFoundError('Post not found');
    }

    const comment = await prisma.comment.create({
      data: {
        postId,
        userId,
        content,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
    });

    log.info(`Comment added to post ${postId} by user ${userId}`);
    return comment;
  }

  async getComments(postId, queryParams = {}) {
    const { page = 1, limit = 20 } = queryParams;

    const post = await prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
    });

    if (!post) {
      throw new NotFoundError('Post not found');
    }

    const take = Math.min(parseInt(limit) || 20, 100);
    const skip = (parseInt(page) - 1) * take;

    const [comments, total] = await Promise.all([
      prisma.comment.findMany({
        where: { postId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
        skip,
        take,
      }),
      prisma.comment.count({ where: { postId } }),
    ]);

    return {
      meta: {
        page: parseInt(page),
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
      comments,
    };
  }

  async deleteComment(commentId, userId) {
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: { post: true },
    });

    if (!comment) {
      throw new NotFoundError('Comment not found');
    }

    if (comment.userId !== userId) {
      throw new ForbiddenError('You can only delete your own comments');
    }

    await prisma.comment.delete({
      where: { id: commentId },
    });

    log.info(`Comment ${commentId} deleted by user ${userId}`);
    return { success: true, message: 'Comment deleted successfully' };
  }

  async updateComment(commentId, userId, content) {
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      throw new NotFoundError('Comment not found');
    }

    if (comment.userId !== userId) {
      throw new ForbiddenError('You can only edit your own comments');
    }

    const updatedComment = await prisma.comment.update({
      where: { id: commentId },
      data: { content },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
    });

    log.info(`Comment ${commentId} updated by user ${userId}`);
    return updatedComment;
  }
}

export const postService = new PostService();
import { catchAsync } from '../../shared/globals/decorators/catch-async.js';
import { ResponseHandler } from '../../shared/globals/helpers/response.handler.js';
import { postService } from './post.service.js';
import { Logger } from '../../config/logger.js';

const log = new Logger('PostController');

class PostController {
  // ==================== POST CRUD ====================

  createPost = catchAsync(async (req, res) => {
    log.info(`Creating post by user: ${req.user.id}`);
    const post = await postService.createPost(req.user.id, req.body);
    ResponseHandler.created(res, {
      message: 'Post created successfully',
      data: { post },
    });
  });

  getPosts = catchAsync(async (req, res) => {
    const result = await postService.getPosts(req.query);
    ResponseHandler.success(res, {
      message: 'Posts fetched successfully',
      data: result,
    });
  });

  getPostById = catchAsync(async (req, res) => {
    const { id } = req.params;
    const post = await postService.getPostById(id);

    // Add like status for authenticated user
    let likeStatus = { liked: false };
    if (req.user?.id) {
      likeStatus = await postService.getLikeStatus(id, req.user.id);
    }

    ResponseHandler.success(res, {
      message: 'Post fetched successfully',
      data: { post, ...likeStatus },
    });
  });

  updatePost = catchAsync(async (req, res) => {
    const { id } = req.params;
    log.info(`Updating post: ${id} by user: ${req.user.id}`);
    const post = await postService.updatePost(id, req.user.id, req.body);
    ResponseHandler.success(res, {
      message: 'Post updated successfully',
      data: { post },
    });
  });

  deletePost = catchAsync(async (req, res) => {
    const { id } = req.params;
    log.info(`Deleting post: ${id} by user: ${req.user.id}`);
    const result = await postService.deletePost(id, req.user.id);
    ResponseHandler.success(res, {
      message: result.message,
      data: { deletedAt: new Date().toISOString() },
    });
  });

  // ==================== LIKES ====================

  toggleLike = catchAsync(async (req, res) => {
    const { id } = req.params;
    log.info(`Toggling like on post: ${id} by user: ${req.user.id}`);
    const result = await postService.toggleLike(id, req.user.id);
    ResponseHandler.success(res, {
      message: result.liked ? 'Post liked' : 'Post unliked',
      data: result,
    });
  });

  // ==================== COMMENTS ====================

  addComment = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { content } = req.body;
    log.info(`Adding comment to post: ${id} by user: ${req.user.id}`);
    const comment = await postService.addComment(id, req.user.id, content);
    ResponseHandler.created(res, {
      message: 'Comment added successfully',
      data: { comment },
    });
  });

  getComments = catchAsync(async (req, res) => {
    const { id } = req.params;
    const result = await postService.getComments(id, req.query);
    ResponseHandler.success(res, {
      message: 'Comments fetched successfully',
      data: result,
    });
  });

  deleteComment = catchAsync(async (req, res) => {
    const { commentId } = req.params;
    log.info(`Deleting comment: ${commentId} by user: ${req.user.id}`);
    const result = await postService.deleteComment(commentId, req.user.id);
    ResponseHandler.success(res, {
      message: result.message,
      data: { deletedAt: new Date().toISOString() },
    });
  });

  updateComment = catchAsync(async (req, res) => {
    const { commentId } = req.params;
    const { content } = req.body;
    log.info(`Updating comment: ${commentId} by user: ${req.user.id}`);
    const comment = await postService.updateComment(commentId, req.user.id, content);
    ResponseHandler.success(res, {
      message: 'Comment updated successfully',
      data: { comment },
    });
  });
}

export const postController = new PostController();
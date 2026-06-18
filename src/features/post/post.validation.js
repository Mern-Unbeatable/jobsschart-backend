import { z } from 'zod';

export const createPostSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long').optional(),
  content: z.string().min(1, 'Content is required'),
  category: z.string().optional().nullable(),
  subCategory: z.string().optional().nullable(),
  postType: z.enum(['THOUGHT', 'QUESTION', 'ANSWER']).default('THOUGHT'),
});

export const updatePostSchema = z.object({
  title: z.string().max(200, 'Title too long').optional(),
  content: z.string().min(1, 'Content cannot be empty').optional(),
  category: z.string().optional().nullable(),
  subCategory: z.string().optional().nullable(),
});

export const commentSchema = z.object({
  content: z.string().min(1, 'Comment content is required').max(1000, 'Comment too long'),
});
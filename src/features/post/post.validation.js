import { z } from 'zod';
import { i18nText, optionalI18nText, sourceLangSchema } from '../../shared/globals/helpers/i18n-schema.js';

export const createPostSchema = z.object({
  title: optionalI18nText(z.string().min(1, 'Title is required').max(200, 'Title too long')),
  content: i18nText(z.string().min(1, 'Content is required')),
  category: optionalI18nText(z.string()),
  subCategory: optionalI18nText(z.string()),
  postType: z.enum(['THOUGHT', 'QUESTION', 'ANSWER']).default('THOUGHT'),
  sourceLang: sourceLangSchema,
});

export const updatePostSchema = z.object({
  title: optionalI18nText(z.string().max(200, 'Title too long')),
  content: optionalI18nText(z.string().min(1, 'Content cannot be empty')),
  category: optionalI18nText(z.string()),
  subCategory: optionalI18nText(z.string()),
  sourceLang: sourceLangSchema,
});

export const commentSchema = z.object({
  content: i18nText(z.string().min(1, 'Comment content is required').max(1000, 'Comment too long')),
  sourceLang: sourceLangSchema,
});

import { z } from 'zod';
import {
  i18nText,
  optionalI18nText,
  sourceLangSchema,
} from '../../shared/globals/helpers/i18n-schema.js';

const emptyToNull = (val) => (val === '' || val === 'null' || val === 'undefined' ? null : val);

const stringOrArray = z
  .union([z.string(), z.array(z.string()), z.null()])
  .optional()
  .transform((val) => {
    // undefined means the field was absent — preserve it so update logic can skip the column
    if (val === undefined) return undefined;
    if (!val) return [];
    if (Array.isArray(val)) return val;
    return val
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  });

const galleryField = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    return [val];
  });

// Blog Schemas
export const createBlogSchema = z.object({
  title: i18nText(z.string().min(5, 'Title must be at least 5 characters')),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  content: optionalI18nText(z.string()),
  excerpt: optionalI18nText(z.string()),
  tags: stringOrArray,
  image: stringOrArray,
  categoryId: z.preprocess(emptyToNull, z.string().uuid().optional().nullable()),
  status: z
    .enum(['DRAFT', 'PENDING_APPROVAL', 'PUBLISHED', 'REJECTED', 'ARCHIVED'])
    .default('DRAFT'),
  metaTitle: optionalI18nText(z.string()),
  metaDescription: optionalI18nText(z.string()),
  readTime: z.number().int().min(1).optional(),
  isFeatured: z
    .union([z.boolean(), z.string()])
    .transform((v) => v === true || v === 'true')
    .default(false),
  sourceLang: sourceLangSchema,
});

export const updateBlogSchema = z.object({
  title: optionalI18nText(z.string()),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  content: optionalI18nText(z.string()),
  excerpt: optionalI18nText(z.string()),
  tags: stringOrArray,
  image: stringOrArray,
  categoryId: z.preprocess(emptyToNull, z.string().uuid().optional().nullable()),
  status: z.enum(['DRAFT', 'PENDING_APPROVAL', 'PUBLISHED', 'REJECTED', 'ARCHIVED']).optional(),
  metaTitle: optionalI18nText(z.string()),
  metaDescription: optionalI18nText(z.string()),
  readTime: z.number().int().optional(),
  isFeatured: z
    .union([z.boolean(), z.string()])
    .transform((v) => v === true || v === 'true')
    .optional(),
  sourceLang: sourceLangSchema,
});

export const createBlogCategorySchema = z.object({
  name: i18nText(z.string().min(2, 'Category name must be at least 2 characters').max(100)),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  description: z.string().max(500).optional().nullable(),
  sourceLang: sourceLangSchema,
});

export const updateBlogCategorySchema = z.object({
  name: optionalI18nText(z.string().min(2).max(100)),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  description: z.string().max(500).optional().nullable(),
  sourceLang: sourceLangSchema,
});

export const categoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  search: z.string().optional(),
  sortBy: z.enum(['name', 'createdAt']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

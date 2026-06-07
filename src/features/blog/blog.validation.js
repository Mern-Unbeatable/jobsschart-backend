
import { z } from 'zod';

const stringOrArray = z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((val) => {
        if (!val) return [];
        if (Array.isArray(val)) return val;
        return val.split(',').map((s) => s.trim()).filter(Boolean);
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
    title: z.string().min(5, 'Title must be at least 5 characters').max(200),
    slug: z.string().min(3).max(200).regex(/^[a-z0-9-]+$/).optional(),
    content: z.string().optional().nullable(),
    excerpt: z.string().max(500).optional().nullable(),
    tags: stringOrArray,
    image: stringOrArray,
    categoryId: z.string().uuid().optional().nullable(),
    status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('DRAFT'),
    metaTitle: z.string().max(150).optional().nullable(),
    metaDescription: z.string().max(300).optional().nullable(),
    readTime: z.number().int().min(1).max(60).optional(),
    isFeatured: z.union([z.boolean(), z.string()])
        .transform((v) => v === true || v === 'true')
        .default(false),
});

export const updateBlogSchema = z.object({
    title: z.string().min(5).max(200).optional(),
    slug: z.string().min(3).max(200).regex(/^[a-z0-9-]+$/).optional(),
    content: z.string().min(50).optional(),
    excerpt: z.string().max(500).optional().nullable(),
    tags: stringOrArray,
    image: stringOrArray,
    categoryId: z.string().uuid().optional().nullable(),
    status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
    metaTitle: z.string().max(150).optional().nullable(),
    metaDescription: z.string().max(300).optional().nullable(),
    readTime: z.number().int().min(1).max(60).optional(),
    isFeatured: z.union([z.boolean(), z.string()])
        .transform((v) => v === true || v === 'true')
        .optional(),
});


export const createBlogCategorySchema = z.object({
    name: z.string().min(2, 'Category name must be at least 2 characters').max(100),
    slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/).optional(),
    description: z.string().max(500).optional().nullable(),
});

export const updateBlogCategorySchema = z.object({
    name: z.string().min(2).max(100).optional(),
    slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/).optional(),
    description: z.string().max(500).optional().nullable(),
});

export const categoryQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(50),
    search: z.string().optional(),
    sortBy: z.enum(['name', 'createdAt']).default('name'),
    sortOrder: z.enum(['asc', 'desc']).default('asc'),
});
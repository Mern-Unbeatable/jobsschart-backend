
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

export const createProductSchema = z.object({
    name: z.string().min(2, 'Name is required').max(200),
    slug: z.string().min(2).max(200).regex(/^[a-z0-9-]+$/, 'Slug: lowercase letters, numbers, hyphens only').optional(),
    description: z.string().min(10, 'Description must be at least 10 characters'),
    subTitle: z.string().max(300).optional().nullable(),
    price: z.coerce.number().positive('Price must be positive'),
    stock: z.coerce.number().int().min(0).default(0),

    isActive: z.union([z.boolean(), z.string()])
        .transform((v) => v === true || v === 'true')
        .default(true),
    features: stringOrArray,
    whatsInside: stringOrArray,
    benefits: stringOrArray,
    gallery: galleryField,
    productCategory: z.string().optional().nullable(),
});

export const updateProductSchema = z.object({
    name: z.string().min(2).max(200).optional(),
    slug: z.string().min(2).max(200).regex(/^[a-z0-9-]+$/).optional(),
    description: z.string().min(10).optional(),
    subTitle: z.string().max(300).optional().nullable(),
    price: z.coerce.number().positive().optional(),
    stock: z.coerce.number().int().min(0).optional(),
    isActive: z.union([z.boolean(), z.string()])
        .transform((v) => v === true || v === 'true')
        .optional(),
    features: stringOrArray,
    whatsInside: stringOrArray,
    benefits: stringOrArray,
    gallery: galleryField,
    productCategory: z.string().uuid('Invalid category ID').optional().nullable(),
});

export const updateStockSchema = z.object({
    stock: z.coerce.number().int().min(0, 'Stock cannot be negative'),
});
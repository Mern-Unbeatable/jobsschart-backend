
import { z } from 'zod';
import { i18nText, optionalI18nText, sourceLangSchema } from '../../shared/globals/helpers/i18n-schema.js';

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
    name: i18nText(z.string().min(2, 'Name is required').max(200)),
    slug: z.string().min(2).max(200).regex(/^[a-z0-9-]+$/, 'Slug: lowercase letters, numbers, hyphens only').optional(),
    description: i18nText(z.string().min(10, 'Description must be at least 10 characters')),
    subTitle: optionalI18nText(z.string().max(300)),
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
    sourceLang: sourceLangSchema,
});

export const updateProductSchema = z.object({
    name: optionalI18nText(z.string().min(2).max(200)),
    slug: z.string().min(2).max(200).regex(/^[a-z0-9-]+$/).optional(),
    description: optionalI18nText(z.string().min(10)),
    subTitle: optionalI18nText(z.string().max(300)),
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
    sourceLang: sourceLangSchema,
});

export const updateStockSchema = z.object({
    stock: z.coerce.number().int().min(0, 'Stock cannot be negative'),
});
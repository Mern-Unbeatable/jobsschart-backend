import { z } from 'zod';

export const createCategorySchema = z.object({
    name: z.string()
        .min(2, 'Category name must be at least 2 characters')
        .max(50, 'Category name must not exceed 50 characters')
        .trim(),
});

export const updateCategorySchema = z.object({
    name: z.string()
        .min(2, 'Category name must be at least 2 characters')
        .max(50, 'Category name must not exceed 50 characters')
        .trim()
        .optional(),
});
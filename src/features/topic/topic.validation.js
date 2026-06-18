import { z } from 'zod';

export const createTopicSchema = z.object({
    name: z.string()
        .min(2, 'Topic name must be at least 2 characters')
        .max(50, 'Topic name must not exceed 50 characters')
        .trim(),
});

export const updateTopicSchema = z.object({
    name: z.string()
        .min(2, 'Topic name must be at least 2 characters')
        .max(50, 'Topic name must not exceed 50 characters')
        .trim()
        .optional(),
});
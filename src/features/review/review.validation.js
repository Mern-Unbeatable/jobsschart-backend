import { z } from 'zod';

export const createReviewSchema = z.object({
    consultantId: z.string().uuid().optional(),
    consultantUserId: z.string().uuid().optional(),
    rating: z.coerce.number().int().min(1).max(5),
    comment: z.string().max(1000).optional(),
}).refine((data) => data.consultantId || data.consultantUserId, {
    message: 'consultantId or consultantUserId is required',
});

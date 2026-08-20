import { z } from 'zod';
import { i18nText, optionalI18nText, sourceLangSchema } from '../../shared/globals/helpers/i18n-schema.js';

export const createReviewSchema = z.object({
  consultantId: z.string().uuid().optional(),
  consultantUserId: z.string().uuid().optional(),
  rating: z.coerce.number().int().min(1).max(5),
  comment: optionalI18nText(z.string().max(1000)),
  sourceLang: sourceLangSchema,
}).refine((data) => data.consultantId || data.consultantUserId, {
  message: 'consultantId or consultantUserId is required',
});


import { z } from 'zod';
import { optionalI18nText, sourceLangSchema } from '../../shared/globals/helpers/i18n-schema.js';

const AdPlacementEnum = z.enum(['HOME', 'CONSULTATION', 'DONATION', 'WEBSHOP', 'GLOBAL']);

export const publishCampaignSchema = z.object({
    placements: z.array(AdPlacementEnum).min(1, 'At least one placement is required'),
    startDate: z.string().datetime().optional().nullable(),
    endDate: z.string().datetime().optional().nullable(),
}).refine(
    (data) => {
        if (data.startDate && data.endDate) {
            return new Date(data.endDate) > new Date(data.startDate);
        }
        return true;
    },
    { message: 'endDate must be after startDate' }
);

export const updateCampaignSettingsSchema = z.object({
    title: optionalI18nText(z.string().min(3).max(200)),
    description: optionalI18nText(z.string().max(1000)),
    image: z.string().url().optional(),
    linkUrl: z.string().url().optional(),
    placements: z.array(AdPlacementEnum).optional(),
    startDate: z.string().datetime().optional().nullable(),
    endDate: z.string().datetime().optional().nullable(),
    sourceLang: sourceLangSchema,
}).refine(
    (data) => {
        if (data.startDate && data.endDate) {
            return new Date(data.endDate) > new Date(data.startDate);
        }
        return true;
    },
    { message: 'endDate must be after startDate' }
);
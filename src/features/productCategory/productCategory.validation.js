import { z } from 'zod';
import { i18nText, optionalI18nText, sourceLangSchema } from '../../shared/globals/helpers/i18n-schema.js';

export const createCategorySchema = z.object({
    name: i18nText(z.string().min(2, 'Category name must be at least 2 characters').max(50)),
    sourceLang: sourceLangSchema,
});

export const updateCategorySchema = z.object({
    name: optionalI18nText(z.string().min(2).max(50)),
    sourceLang: sourceLangSchema,
});

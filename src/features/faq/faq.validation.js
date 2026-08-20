import { z } from 'zod';
import { i18nText, optionalI18nText, sourceLangSchema } from '../../shared/globals/helpers/i18n-schema.js';

export const createFaqSchema = z.object({
  question: i18nText(z.string().min(3, 'Question must be at least 3 characters').max(500, 'Question too long')),
  answer: i18nText(z.string().min(3, 'Answer must be at least 3 characters').max(5000, 'Answer too long')),
  sourceLang: sourceLangSchema,
});

export const updateFaqSchema = z.object({
  question: optionalI18nText(z.string().min(3).max(500)),
  answer: optionalI18nText(z.string().min(3).max(5000)),
  sourceLang: sourceLangSchema,
});

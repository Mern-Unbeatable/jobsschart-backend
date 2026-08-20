import { z } from 'zod';
import { i18nText, optionalI18nText, sourceLangSchema } from '../../shared/globals/helpers/i18n-schema.js';

export const createQuestionSchema = z.object({
  subject: i18nText(z.string().min(3, 'Subject must be at least 3 characters').max(200, 'Subject too long')),
  question: i18nText(z.string().min(5, 'Question must be at least 5 characters').max(5000, 'Question too long')),
  topic: optionalI18nText(z.string().max(100, 'Topic too long')).optional().nullable(),
  sourceLang: sourceLangSchema,
});

export const answerQuestionSchema = z.object({
  answer: i18nText(z.string().min(5, 'Answer must be at least 5 characters').max(5000, 'Answer too long')),
  sourceLang: sourceLangSchema,
});

export const updateQuestionStatusSchema = z.object({
  status: z.enum(['PENDING', 'ANSWERED', 'CLOSED']),
});

import { z } from 'zod';

export const sourceLangSchema = z.enum(['en', 'nl']).optional();

export const i18nObjectSchema = z.object({
  en: z.string().optional(),
  nl: z.string().optional(),
}).refine((value) => !!(value.en?.trim() || value.nl?.trim()), {
  message: 'Provide English or Dutch text',
});

/** Allow FormData stringified `{ "en": "...", "nl": "..." }` payloads. */
function coerceI18nInput(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{')) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

export const i18nText = (stringSchema = z.string().min(1)) =>
  z.preprocess(coerceI18nInput, z.union([stringSchema, i18nObjectSchema]));

export const optionalI18nText = (stringSchema = z.string()) =>
  z.preprocess(
    coerceI18nInput,
    z.union([stringSchema, i18nObjectSchema]).optional().nullable(),
  );

import { z } from 'zod';

const tagsField = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'string' && val.startsWith('[')) {
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return val.split(',').map((s) => s.trim()).filter(Boolean);
      }
    }
    return val.split(',').map((s) => s.trim()).filter(Boolean);
  });

const activityTypeField = z.enum(['event', 'workshop']);

const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

const optionalText = (max, message) =>
  z
    .union([z.string().max(max, message), z.literal('')])
    .optional()
    .nullable()
    .transform((val) => (val?.trim() ? val.trim() : null));

const optionalImage = z
  .union([z.string().url('Image must be a valid URL'), z.literal('')])
  .optional()
  .nullable()
  .transform((val) => (val?.trim() ? val.trim() : null));

export const createActivitySchema = z.object({
  type: activityTypeField,
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  host: z.string().min(1, 'Host name is required'),
  date: dateField,
  time: z.string().min(1, 'Time is required'),
  hostTitle: optionalText(200),
  price: optionalText(50),
  location: optionalText(300),
  duration: optionalText(50),
  tags: tagsField,
  image: optionalImage,
});

export const updateActivitySchema = z.object({
  type: activityTypeField.optional(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  host: z.string().optional(),
  date: dateField.optional(),
  time: z.string().optional(),
  hostTitle: optionalText(200),
  price: optionalText(50),
  location: optionalText(200),
  duration: optionalText(50),
  tags: tagsField,
  image: optionalImage,
});

export const registerActivitySchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  emailAddress: z.string().email('Please provide a valid email address'),
});

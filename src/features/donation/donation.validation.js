import { z } from 'zod';
import { i18nText, optionalI18nText, sourceLangSchema } from '../../shared/globals/helpers/i18n-schema.js';

export const createDonationSchema = z.object({
  donorType: z.enum(['INDIVIDUAL', 'BUSINESS']),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  phone: z.string().min(5, 'Phone number is required').max(20),
  email: z.string().email('Valid email is required'),
  amount: z.number().int().min(100, 'Minimum donation amount is €100.00'),
  description: optionalI18nText(z.string().max(500)),
  location: optionalI18nText(z.string().max(200)),
  businessName: z.string().max(200).optional(),
  websiteUrl: z.string().max(500).optional(),
  businessType: z.enum(['LOCAL_BUSINESS', 'ONLINE_BUSINESS']).optional().default('LOCAL_BUSINESS'),
  image: z.string().url('Invalid image URL').optional(),
  benefit: i18nText(z.string().min(3, 'Benefit description is required').max(500)),
  sourceLang: sourceLangSchema,
});

export const updateDonationSchema = createDonationSchema.partial();

import { z } from 'zod';
import { i18nText, optionalI18nText, sourceLangSchema } from '../../shared/globals/helpers/i18n-schema.js';

const donationDataSchema = z.object({
  donorType: z.enum(['INDIVIDUAL', 'BUSINESS']),
  name: z.string().min(2).max(100),
  phone: z.string().min(5).max(20),
  email: z.string().email(),
  amount: z.number().int().positive('Amount must be a positive integer'),
  description: optionalI18nText(z.string().max(490)),
  location: optionalI18nText(z.string().max(200)),
  image: z.string().url().optional(),
  benefit: i18nText(z.string().min(3).max(490)),
  businessName: z.string().max(200).optional(),
  websiteUrl: z.string().max(500).optional(),
  businessType: z.enum(['LOCAL_BUSINESS', 'ONLINE_BUSINESS']).optional().default('LOCAL_BUSINESS'),
  sourceLang: sourceLangSchema,
});

const cartItemSchema = z.object({
  productId: z.string().uuid('Invalid product ID'),
  quantity: z.number().int().positive().max(100),
});

const shippingAddressSchema = z.object({
  street: z.string().min(1),
  city: z.string().min(1),
  state: z.string().optional(),
  postalCode: z.string().min(1),
  country: z.string().min(2),
}).optional();

export const createCheckoutSchema = z
  .object({
    type: z.enum(['PACKAGE', 'DONATION', 'WEBSHOP']),

    packageId: z.string().uuid().optional(),

    donationData: donationDataSchema.optional(),

    cartItems: z.array(cartItemSchema).min(1).optional(),
    shippingAddress: shippingAddressSchema,
    phone: z.string().max(20).optional(),
    paymentMethod: z.enum([
      'ideal',
      'bancontact',
      'creditcard',
      'paypal',
      'applepay',
      'googlepay',
      'banktransfer',
      'klarnapaylater',
      'klarnapaynow',
      'klarnasliceit',
      'giftcard',
      'paysafecard',
    ]).optional(),
  })
  .refine(
    (data) => {
      if (data.type === 'PACKAGE' && !data.packageId) return false;
      if (data.type === 'DONATION' && !data.donationData) return false;
      if (data.type === 'WEBSHOP' && (!data.cartItems || data.cartItems.length === 0)) return false;
      return true;
    },
    {
      message: 'packageId required for PACKAGE | donationData required for DONATION | cartItems required for WEBSHOP',
    }
  );

export const paymentMethodsQuerySchema = z.object({
  amount: z.coerce.number().positive().optional().default(10),
});

export const verifyPaymentSchema = z.object({
  session_id: z.string().min(1, 'session_id is required'),
});
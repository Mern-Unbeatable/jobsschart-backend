// src/config/env.validation.js
import dotenv from 'dotenv';
import { z } from 'zod';
import { Logger } from './logger.js';

dotenv.config();

const logger = new Logger('env-validation');

const schema = z
  .object({
    // App
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    PORT: z
      .string()
      .default('5000')
      .transform((val) => parseInt(val, 10))
      .refine((num) => !isNaN(num) && num > 0 && num <= 65535, {
        message: 'PORT must be a positive integer between 1 and 65535',
      }),

    API_URL: z.string().url().optional(),
    BACKEND_URL: z.string().url().default('http://localhost:5000'),
    FRONTEND_URL: z.string().url().default('http://localhost:5173'),

    CLIENT_URLS: z
      .string()
      .optional()
      .transform((val) => {
        if (!val) return ['http://localhost:5173'];
        return val.split(',').map((url) => url.trim());
      }),

    // Database
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    // JWT
    JWT_TOKEN: z.string().min(32, 'JWT_TOKEN must be at least 32 characters'),
    JWT_REFRESH_TOKEN: z.string().min(32, 'JWT_REFRESH_TOKEN must be at least 32 characters'),

    // Redis (optional)
    REDIS_URL: z.string().optional(),

    // Cloudinary (optional)
    CLOUD_NAME: z.string().optional(),
    CLOUD_API_KEY: z.string().optional(),
    CLOUD_API_SECRET: z.string().optional(),

    // Puppeteer/Chrome
    PUPPETEER_EXECUTABLE_PATH: z.string().optional(),
    CHROME_BIN: z.string().optional(),
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: z
      .string()
      .optional()
      .transform((val) => val === 'true'),

    // SMTP
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z
      .string()
      .optional()
      .transform((val) => val ? parseInt(val, 10) : undefined),
    SMTP_USER: z.string().email().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().email().optional(),

    // Legacy SMTP
    SENDER_EMAIL: z.string().email().optional(),
    SENDER_EMAIL_PASSWORD: z.string().optional(),

    // SendGrid
    SENDGRID_API_KEY: z.string().optional(),
    SENDGRID_SENDER: z.string().email().optional(),

    // Stripe
    STRIPE_SECRET_KEY: z.string().min(1, 'STRIPE_SECRET_KEY is required'),
    STRIPE_WEBHOOK_SECRET: z.string().min(1, 'STRIPE_WEBHOOK_SECRET is required'),

    // Admin
    ADMIN_EMAIL: z.string().email('ADMIN_EMAIL must be a valid email'),
    ADMIN_PASSWORD: z.string().min(6, 'ADMIN_PASSWORD must be at least 6 characters'),

    // OpenAI (if you're using AI features)
    OPENAI_API_KEY: z.string().optional(),

    // Google OAuth (if you're using Google login)
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CALLBACK_URL: z.string().url().optional(),

    // ============================================
    // TWILIO (for video calls, SMS, etc.)
    // ============================================
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_API_KEY: z.string().optional(),
    TWILIO_API_SECRET: z.string().optional(),
    TWILIO_VIDEO_SERVICE_SID: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // Production validation
    if (data.NODE_ENV === 'production') {
      // Check if at least one email service is configured
      const hasSMTP = data.SMTP_HOST && data.SMTP_USER && data.SMTP_PASS;
      const hasSendGrid = data.SENDGRID_API_KEY && data.SENDGRID_SENDER;
      const hasLegacySMTP = data.SENDER_EMAIL && data.SENDER_EMAIL_PASSWORD;

      if (!hasSMTP && !hasSendGrid && !hasLegacySMTP) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Production: Either SMTP, SendGrid, or Legacy SMTP must be configured',
          path: ['SMTP_HOST'],
        });
      }

      // Production URL validations
      if (!data.API_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Production: API_URL is required',
          path: ['API_URL'],
        });
      }

      // Stripe webhook secret should start with whsec_ in production
      if (data.STRIPE_WEBHOOK_SECRET && !data.STRIPE_WEBHOOK_SECRET.startsWith('whsec_')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Production: STRIPE_WEBHOOK_SECRET should start with "whsec_"',
          path: ['STRIPE_WEBHOOK_SECRET'],
        });
      }

      // Optional: Add Twilio validation for production if needed
      const hasTwilio = data.TWILIO_ACCOUNT_SID && data.TWILIO_AUTH_TOKEN;
      if (!hasTwilio) {
        logger.warn('⚠️ Twilio not fully configured. Video/SMS features may not work.');
      }
    }

    // Development validation
    if (data.NODE_ENV === 'development') {
      // Check if JWT tokens are not using default values in production-like env
      if (data.JWT_TOKEN === 'supersecretjwtkey_supersecretjwtkey_123') {
        logger.warn('⚠️ Using default JWT_TOKEN in development. Change this in production!');
      }
      if (data.JWT_REFRESH_TOKEN === 'supersecretrefreshkey_supersecret_456') {
        logger.warn('⚠️ Using default JWT_REFRESH_TOKEN in development. Change this in production!');
      }
    }
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  logger.error('❌ Invalid environment variables:');

  // Format errors beautifully
  const errors = parsed.error.format();
  Object.keys(errors).forEach(key => {
    if (key !== '_errors' && errors[key]?._errors?.length) {
      logger.error(`  • ${key}: ${errors[key]._errors.join(', ')}`);
    }
  });

  if (errors._errors?.length) {
    logger.error(`  • ${errors._errors.join(', ')}`);
  }

  process.exit(1);
}

export const env = parsed.data;
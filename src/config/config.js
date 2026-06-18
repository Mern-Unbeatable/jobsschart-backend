// src/config/config.js
import { env } from './env.validation.js';
import { Logger } from './logger.js';
import { CloudinaryService } from './cloudinary.js';

class Config {
  // App
  NODE_ENV = env.NODE_ENV;
  PORT = env.PORT;
  API_URL = env.API_URL;
  BACKEND_URL = env.BACKEND_URL;
  FRONTEND_URL = env.FRONTEND_URL;
  CLIENT_URLS = env.CLIENT_URLS;

  // Database
  DATABASE_URL = env.DATABASE_URL;

  // JWT
  JWT_TOKEN = env.JWT_TOKEN;
  JWT_REFRESH_TOKEN = env.JWT_REFRESH_TOKEN;

  // Redis
  REDIS_URL = env.REDIS_URL;

  // SMTP
  SMTP_HOST = env.SMTP_HOST;
  SMTP_PORT = env.SMTP_PORT;
  SMTP_USER = env.SMTP_USER;
  SMTP_PASS = env.SMTP_PASS;
  SMTP_FROM = env.SMTP_FROM || env.SMTP_USER;

  // Legacy SMTP
  SENDER_EMAIL = env.SENDER_EMAIL;
  SENDER_EMAIL_PASSWORD = env.SENDER_EMAIL_PASSWORD;

  // SendGrid
  SENDGRID_API_KEY = env.SENDGRID_API_KEY;
  SENDGRID_SENDER = env.SENDGRID_SENDER;

  // Cloudinary
  CLOUD_NAME = env.CLOUD_NAME;
  CLOUD_API_KEY = env.CLOUD_API_KEY;
  CLOUD_API_SECRET = env.CLOUD_API_SECRET;
  HAS_CLOUDINARY = !!(env.CLOUD_NAME && env.CLOUD_API_KEY && env.CLOUD_API_SECRET);

  // Stripe
  STRIPE_SECRET_KEY = env.STRIPE_SECRET_KEY;
  STRIPE_WEBHOOK_SECRET = env.STRIPE_WEBHOOK_SECRET;

  // Admin
  ADMIN_EMAIL = env.ADMIN_EMAIL;
  ADMIN_PASSWORD = env.ADMIN_PASSWORD;

  // OpenAI
  OPENAI_API_KEY = env.OPENAI_API_KEY;
  HAS_OPENAI = !!env.OPENAI_API_KEY;

  // Google OAuth
  GOOGLE_CLIENT_ID = env.GOOGLE_CLIENT_ID;
  GOOGLE_CLIENT_SECRET = env.GOOGLE_CLIENT_SECRET;
  GOOGLE_CALLBACK_URL = env.GOOGLE_CALLBACK_URL;
  HAS_GOOGLE_AUTH = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

  // Puppeteer/Chrome
  PUPPETEER_EXECUTABLE_PATH = env.PUPPETEER_EXECUTABLE_PATH;
  CHROME_BIN = env.CHROME_BIN;
  PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD;

  // ============================================
  // TWILIO (for video calls, SMS, etc.)
  // ============================================
  TWILIO_ACCOUNT_SID = env.TWILIO_ACCOUNT_SID;
  TWILIO_AUTH_TOKEN = env.TWILIO_AUTH_TOKEN;
  TWILIO_API_KEY = env.TWILIO_API_KEY;
  TWILIO_API_SECRET = env.TWILIO_API_SECRET;
  TWILIO_VIDEO_SERVICE_SID = env.TWILIO_VIDEO_SERVICE_SID;
  HAS_TWILIO = !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN);

  logger;
  cloudinary;

  constructor() {
    this.logger = new Logger('Config');

    // Initialize Cloudinary if configured
    if (this.HAS_CLOUDINARY) {
      this.cloudinary = new CloudinaryService(
        this.CLOUD_NAME,
        this.CLOUD_API_KEY,
        this.CLOUD_API_SECRET,
      );
    } else {
      this.logger.warn('Cloudinary not configured. File uploads will use local storage.');
    }
  }

  initialize() {
    try {
      // Initialize Cloudinary
      if (this.HAS_CLOUDINARY && this.cloudinary) {
        this.cloudinary.init();
        this.logger.info('Cloudinary initialized successfully');
      }

      // Log configuration status
      this.logger.info('Configuration initialized', {
        env: this.NODE_ENV,
        port: this.PORT,
        backendUrl: this.BACKEND_URL,
        frontendUrl: this.FRONTEND_URL,
        hasCloudinary: this.HAS_CLOUDINARY,
        hasOpenAI: this.HAS_OPENAI,
        hasGoogleAuth: this.HAS_GOOGLE_AUTH,
        hasStripe: !!this.STRIPE_SECRET_KEY,
        hasEmailService: !!(this.SMTP_HOST || this.SENDGRID_API_KEY || this.SENDER_EMAIL),
        hasTwilio: this.HAS_TWILIO, // Add Twilio status
      });
    } catch (error) {
      this.logger.error('Failed to initialize config', error);
      throw error;
    }
  }

  validateRequired() {
    const required = ['JWT_TOKEN', 'JWT_REFRESH_TOKEN', 'DATABASE_URL'];
    const missing = required.filter((key) => !this[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required config: ${missing.join(', ')}`);
    }

    // Production additional checks
    if (this.NODE_ENV === 'production') {
      const productionRequired = ['API_URL', 'BACKEND_URL', 'FRONTEND_URL'];
      const prodMissing = productionRequired.filter((key) => !this[key]);

      if (prodMissing.length > 0) {
        throw new Error(`Production: Missing required config: ${prodMissing.join(', ')}`);
      }
    }

    return true;
  }

  // Helper method to check if running in production
  isProduction() {
    return this.NODE_ENV === 'production';
  }

  // Helper method to check if running in development
  isDevelopment() {
    return this.NODE_ENV === 'development';
  }

  // Helper method to check if running in test
  isTest() {
    return this.NODE_ENV === 'test';
  }

  // Helper method for Twilio
  isTwilioConfigured() {
    return this.HAS_TWILIO;
  }
}

export const config = new Config();
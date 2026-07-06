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

  // Admin
  ADMIN_EMAIL = env.ADMIN_EMAIL;
  ADMIN_PASSWORD = env.ADMIN_PASSWORD;

  // ============================================
  // TWILIO (for video calls, SMS, etc.)
  // ============================================
  TWILIO_ACCOUNT_SID = env.TWILIO_ACCOUNT_SID;
  TWILIO_AUTH_TOKEN = env.TWILIO_AUTH_TOKEN;
  TWILIO_API_KEY = env.TWILIO_API_KEY;
  TWILIO_API_SECRET = env.TWILIO_API_SECRET;
  TWILIO_VIDEO_SERVICE_SID = env.TWILIO_VIDEO_SERVICE_SID;
  HAS_TWILIO = !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN);

  // Mollie
  MOLLIE_API_KEY = env.MOLLIE_API_KEY || env.MOLLIE_API_KEY_TEST || env.MOLLIE_API_KEY_LIVE;
  MOLLIE_MODE = env.MOLLIE_API_KEY ? (env.MOLLIE_API_KEY.startsWith('test_') ? 'test' : 'live') : (env.MOLLIE_API_KEY_TEST ? 'test' : (env.MOLLIE_API_KEY_LIVE ? 'live' : 'none'));
  MOLLIE_WEBHOOK_URL = env.MOLLIE_WEBHOOK_URL || env.webhookurl || null;
  MOLLIE_WEBHOOK_SECRET = env.MOLLIE_WEBHOOK_SECRET || env.webhooksecrte || null;
  HAS_MOLLIE = !!(env.MOLLIE_API_KEY || env.MOLLIE_API_KEY_LIVE || env.MOLLIE_API_KEY_TEST);

  logger;
  cloudinary;

  constructor() {
    this.logger = new Logger('Config');


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
        hasTwilio: this.HAS_TWILIO,
        hasMollie: this.HAS_MOLLIE,
        mollieMode: this.MOLLIE_MODE,
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
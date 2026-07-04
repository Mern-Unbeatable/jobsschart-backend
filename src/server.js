import { json, urlencoded } from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import hpp from 'hpp';
import compression from 'compression';
import HTTP_STATUS from 'http-status-codes';
import apiStats from 'swagger-stats';
import express from 'express';
import passport from 'passport';
import path from 'path';
import fs from 'fs';
import morgan from 'morgan';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';  // ✅ ADD THIS IMPORT

import { config } from './config/config.js';
import applicationRoutes from './routes/index.js';
import { Logger } from './config/logger.js';
import { CustomError } from './shared/globals/helpers/error-handler.js';
import { initSocket } from './socket/index.js';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class Server {
  constructor(app) {
    this.app = app;
    this.log = new Logger('Server');
    this.isConfigured = false;
  }

  start() {
    this.configure();
    void this.startServer(this.app);
  }

  configure() {
    if (this.isConfigured) return;
    this.securityMiddleware(this.app);
    this.standardMiddleware(this.app);       // ✅ MOVED UP - cookieParser must be first
    this.geoRedirectMiddleware(this.app);    // ✅ AFTER cookieParser
    this.webhookRawBody(this.app);
    this.staticFileMiddleware(this.app);
    this.routesMiddleware(this.app);
    this.apiMonitoring(this.app);
    this.globalErrorHandler(this.app);
    this.isConfigured = true;
  }

  geoRedirectMiddleware(app) {
    app.use(async (req, res, next) => {
      // Skip in non-production environments
      if (config.NODE_ENV !== 'production') {
        return next();
      }

      // Redirect only for browser navigation requests (GET, HEAD)
      if (!['GET', 'HEAD'].includes(req.method)) {
        return next();
      }

      // Skip API, static paths, and websocket
      if (
        req.path.startsWith('/api/') ||
        req.path.startsWith('/uploads/') ||
        req.path.startsWith('/socket.io/') ||
        req.path.startsWith('/api-monitoring') ||
        req.path === '/health'
      ) {
        return next();
      }

      const supportedHosts = ['illorac.com', 'illorac.nl'];

      const host = String(req.hostname || '')
        .toLowerCase()
        .replace(/^www\./, '');

      // Only redirect if request is coming to one of our supported domains
      if (!supportedHosts.includes(host)) {
        return next();
      }

      // ✅ Now req.cookies will work because cookieParser is loaded first
      let country = req.cookies?.country_code || null;

      if (!country) {
        // Get client IP (considering proxy/trust proxy setting)
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
          req.socket?.remoteAddress ||
          req.ip ||
          '127.0.0.1';

        // Skip localhost/private IPs
        if (
          clientIp === '127.0.0.1' ||
          clientIp === '::1' ||
          clientIp.startsWith('192.168.') ||
          clientIp.startsWith('10.')
        ) {
          return next();
        }

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);

          const response = await fetch(`https://ipapi.co/${clientIp}/json/`, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'illorac-geo-redirect/1.0'
            }
          });

          clearTimeout(timeoutId);

          if (response.ok) {
            const data = await response.json();
            country = data.country_code?.toUpperCase() || '';

            // Cache in cookie for 7 days
            res.cookie('country_code', country, {
              maxAge: 7 * 24 * 60 * 60 * 1000,
              httpOnly: false,
              secure: true,
              sameSite: 'Lax'
            });

            console.log(`GeoIP: ${clientIp} -> ${country}`);
          } else {
            console.warn(`GeoIP API error: ${response.status}`);
            return next();
          }
        } catch (error) {
          console.error('GeoIP lookup failed:', error.message);
          return next();
        }
      }

      // Determine target domain based on country
      const targetDomain = country === 'NL' ? 'illorac.nl' : 'illorac.com';

      // If not on the correct domain, redirect
      if (host !== targetDomain) {
        const targetUrl = `https://${targetDomain}${req.originalUrl || ''}`;
        console.log(`Redirecting: ${host} -> ${targetDomain} (Country: ${country})`);
        return res.redirect(302, targetUrl);
      }

      next();
    });
  }

  securityMiddleware(app) {
    app.set('trust proxy', 1);
    app.use(hpp());

    app.use(
      helmet({
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
        contentSecurityPolicy: false,
      }),
    );

    const allowedOrigins = [
      'http://localhost:5173',
      'https://illorac.com',
      'https://illorac.nl'
    ];

    app.use(
      cors({
        origin: (origin, callback) => {
          if (!origin) return callback(null, true);
          if (allowedOrigins.includes(origin)) {
            return callback(null, true);
          }
          if (origin && origin.includes('localhost')) {
            return callback(null, true);
          }
          return callback(new Error(`CORS blocked: ${origin}`));
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
        exposedHeaders: ['Content-Disposition'],
        optionsSuccessStatus: 200,
      }),
    );
  }

  webhookRawBody(app) {
    app.use(
      '/api/v1/payments/webhook',
      express.raw({
        type: 'application/json',
        limit: '1mb',
      }),
    );
  }

  standardMiddleware(app) {
    // ✅ cookie-parser FIRST
    app.use(cookieParser());

    // HTTP request logger
    app.use(morgan(config.NODE_ENV === 'development' ? 'dev' : 'combined'));

    app.use(compression());
    app.use(json({ limit: '50mb' }));
    app.use(urlencoded({ extended: true, limit: '50mb' }));

    // Request logging middleware
    app.use((req, _res, next) => {
      this.log.http(`${req.method} ${req.originalUrl}`);
      next();
    });

    app.use(passport.initialize());
  }

  staticFileMiddleware(app) {
    const uploadsPath = path.join(process.cwd(), "uploads");

    if (!fs.existsSync(uploadsPath)) {
      fs.mkdirSync(uploadsPath, { recursive: true });
      this.log.info(`Created uploads directory at: ${uploadsPath}`);
    }

    app.use(
      "/uploads",
      express.static(uploadsPath, {
        dotfiles: "ignore",
        etag: true,
        index: false,
        maxAge: "1d",
        fallthrough: true,
      })
    );

    this.log.info(`Static files served from: ${uploadsPath}`);
  }

  routesMiddleware(app) {
    applicationRoutes(app);

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.status(200).json({
        success: true,
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        environment: config.NODE_ENV
      });
    });

    // Root endpoint
    app.get('/', (req, res) => {
      res.json({
        success: true,
        message: 'Jobsschart Backend API',
        version: '1.0.0',
        environment: config.NODE_ENV,
        endpoints: {
          health: '/health',
          api: '/api/v1',
          uploads: '/uploads'
        }
      });
    });

    // ✅ Debug endpoint - REMOVE AFTER TESTING
    app.get('/debug-geo', async (req, res) => {
      const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.socket?.remoteAddress ||
        req.ip;

      let geoData = null;
      try {
        const response = await fetch(`https://ipapi.co/${clientIp}/json/`);
        geoData = await response.json();
      } catch (e) {
        geoData = { error: e.message };
      }

      res.json({
        clientIp,
        host: req.hostname,
        cookie: req.cookies?.country_code || 'NOT SET',
        geoData,
        targetDomain: (geoData?.country_code?.toUpperCase() === 'NL') ? 'illorac.nl' : 'illorac.com'
      });
    });
  }

  apiMonitoring(app) {
    if (config.NODE_ENV === 'test') return;
    app.use(apiStats.getMiddleware({ uriPath: '/api-monitoring' }));
  }

  globalErrorHandler(app) {
    app.use((req, res, next) => {
      if (req.path.startsWith('/api/')) {
        res.status(HTTP_STATUS.NOT_FOUND).json({
          status: 'error',
          statusCode: HTTP_STATUS.NOT_FOUND,
          message: `${req.originalUrl} not found`,
        });
      } else {
        next();
      }
    });

    app.use((error, _req, res, _next) => {
      this.log.error('Global error handler', {
        name: error.name,
        message: error.message,
        stack: error.stack,
      });

      if (error instanceof CustomError) {
        return res.status(error.statusCode).json(error.serializeErrors());
      }

      if (error.name === 'JsonWebTokenError') {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          status: 'error',
          statusCode: HTTP_STATUS.UNAUTHORIZED,
          message: 'Invalid authentication token',
        });
      }

      if (error.name === 'TokenExpiredError') {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          status: 'error',
          statusCode: HTTP_STATUS.UNAUTHORIZED,
          message: 'Authentication token expired',
        });
      }

      if (error.code === 'P2002') {
        return res.status(HTTP_STATUS.CONFLICT).json({
          status: 'error',
          statusCode: HTTP_STATUS.CONFLICT,
          message: 'A record with this value already exists',
        });
      }

      if (error.code === 'P2025') {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          status: 'error',
          statusCode: HTTP_STATUS.NOT_FOUND,
          message: 'Record not found',
        });
      }

      const isProduction = config.NODE_ENV === 'production';
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        status: 'error',
        statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
        message: isProduction ? 'Internal server error' : error.message,
        ...(isProduction ? {} : { stack: error.stack }),
      });
    });
  }

  async startServer(app) {
    if (!config.JWT_TOKEN) throw new Error('JWT_TOKEN must be provided');
    if (!config.JWT_REFRESH_TOKEN) throw new Error('JWT_REFRESH_TOKEN must be provided');

    try {
      const httpServer = new http.Server(app);
      this.startHttpServer(httpServer);
    } catch (error) {
      this.log.error('Failed to start server', error);
      process.exit(1);
    }
  }

  startHttpServer(httpServer) {
    this.log.info(`Worker started (PID: ${process.pid})`);
    initSocket(httpServer);
    this.log.info('Socket.io initialized');

    httpServer.listen(config.PORT, () => {
      this.log.info(`Server running on port ${config.PORT}`);
      this.log.info(`Environment: ${config.NODE_ENV}`);
      this.log.info(`Static files available at: http://localhost:${config.PORT}/uploads`);
      this.log.info(`Backend URL: ${config.BACKEND_URL || `http://localhost:${config.PORT}`}`);
      this.log.info(`Socket server connection successfully`);
    });

    httpServer.on('error', (error) => {
      this.log.error('HTTP server error', error);
      if (error.code === 'EADDRINUSE') {
        this.log.error(`Port ${config.PORT} is already in use`);
        process.exit(1);
      }
    });
  }
}
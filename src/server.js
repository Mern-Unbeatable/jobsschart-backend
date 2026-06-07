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
    this.webhookRawBody(this.app);
    this.standardMiddleware(this.app);
    this.staticFileMiddleware(this.app);
    this.routesMiddleware(this.app);
    this.apiMonitoring(this.app);
    this.globalErrorHandler(this.app);
    this.isConfigured = true;
  }

  securityMiddleware(app) {
    app.set('trust proxy', 1);
    app.use(hpp());

    // Helmet configuration - less strict for static files
    app.use(
      helmet({
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
        contentSecurityPolicy: false, // Disable CSP for development
      }),
    );

    const allowedOrigins = [
      'http://localhost:5173',
      'https://jbosschart.maktechgroup.tech'
    ];

    app.use(
      cors({
        origin: (origin, callback) => {
          if (!origin) return callback(null, true);
          if (allowedOrigins.includes(origin)) {
            return callback(null, true);
          }
          // Allow all localhost origins for development
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

  // Static file middleware - SIMPLIFIED like your working project
  staticFileMiddleware(app) {
    //  Same root as the upload utility — always project root
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
    // Mount all API routes
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
  }

  apiMonitoring(app) {
    if (config.NODE_ENV === 'test') return;
    app.use(apiStats.getMiddleware({ uriPath: '/api-monitoring' }));
  }

  globalErrorHandler(app) {
    // Handle 404 for API routes
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

    // Global error handler
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

      // Prisma errors
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

  // startHttpServer(httpServer) {
  //   this.log.info(`Worker started (PID: ${process.pid})`);
  //   httpServer.listen(config.PORT, () => {
  //     this.log.info(`Server running on port ${config.PORT}`);
  //     this.log.info(`Environment: ${config.NODE_ENV}`);
  //     this.log.info(`Static files available at: http://localhost:${config.PORT}/uploads`);
  //     this.log.info(`Backend URL: ${config.BACKEND_URL || `http://localhost:${config.PORT}`}`);
  //   });
  //   httpServer.on('error', (error) => {
  //     this.log.error('HTTP server error', error);
  //     if (error.code === 'EADDRINUSE') {
  //       this.log.error(`Port ${config.PORT} is already in use`);
  //       process.exit(1);
  //     }
  //   });
  // }

  // In startHttpServer method, modify:


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
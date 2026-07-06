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
import cookieParser from 'cookie-parser';

import { config } from './config/config.js';
import applicationRoutes from './routes/index.js';
import { Logger } from './config/logger.js';
import { CustomError } from './shared/globals/helpers/error-handler.js';
import { initSocket } from './socket/index.js';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GEO_COOKIE_NAME = 'country_code';
const GEO_COOKIE_MAX_AGE = 24 * 60 * 60 * 1000;
const GEO_SUPPORTED_HOSTS = ['illorac.com', 'illorac.nl'];
const GEO_IP_CACHE_TTL = 6 * 60 * 60 * 1000;

export class Server {
  constructor(app) {
    this.app = app;
    this.log = new Logger('Server');
    this.isConfigured = false;
    this.geoIpCache = new Map();
  }

  start() {
    this.configure();
    void this.startServer(this.app);
  }

  configure() {
    if (this.isConfigured) return;
    this.securityMiddleware(this.app);
    this.standardMiddleware(this.app);
    this.geoRedirectMiddleware(this.app);
    this.webhookRawBody(this.app);
    this.staticFileMiddleware(this.app);
    this.routesMiddleware(this.app);
    this.apiMonitoring(this.app);
    this.globalErrorHandler(this.app);
    this.isConfigured = true;
  }

  geoRedirectMiddleware(app) {
    app.use(async (req, res, next) => {
      const host = this.getRequestHost(req);

      // Run geo redirect only on our public domains
      if (!GEO_SUPPORTED_HOSTS.includes(host)) {
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
        req.path === '/geo-routing' ||
        req.path === '/health'
      ) {
        return next();
      }

      let country = this.normalizeCountryCode(req.cookies?.[GEO_COOKIE_NAME]);
      let clientIp = this.getClientIpFromRequest(req);

      if (!country && clientIp) {
        country = await this.fetchCountryCodeFromIpApi(clientIp);

        if (country) {
          const requestIsSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
          res.cookie(GEO_COOKIE_NAME, country, {
            maxAge: GEO_COOKIE_MAX_AGE,
            httpOnly: false,
            secure: requestIsSecure,
            sameSite: 'Lax',
          });
        }
      }

      if (!country) {
        this.log.warn('Geo country unavailable, defaulting to .com routing', {
          host,
          path: req.originalUrl,
          ip: clientIp,
          cookieCountry: req.cookies?.[GEO_COOKIE_NAME] || null,
        });
      }

      // Determine target domain based on country
      const targetDomain = country === 'NL' ? 'illorac.nl' : 'illorac.com';

      // If not on the correct domain, redirect
      if (host !== targetDomain) {
        const targetUrl = `https://${targetDomain}${req.originalUrl || ''}`;
        this.log.info('Geo redirect', {
          fromHost: host,
          toHost: targetDomain,
          country,
          ip: clientIp,
          path: req.originalUrl,
        });
        return res.redirect(302, targetUrl);
      }

      next();
    });
  }

  getRequestHost(req) {
    const forwardedHostRaw = req.headers['x-forwarded-host'];
    const hostRaw = typeof forwardedHostRaw === 'string' && forwardedHostRaw.length > 0
      ? forwardedHostRaw
      : (req.headers.host || req.hostname || '');

    let host = String(hostRaw)
      .split(',')[0]
      .trim()
      .toLowerCase()
      .replace(/^www\./, '');

    if (host.includes(':')) {
      [host] = host.split(':');
    }

    return host;
  }

  normalizeCountryCode(value) {
    if (!value || typeof value !== 'string') return null;
    const country = value.trim().toUpperCase();
    return /^[A-Z]{2}$/.test(country) ? country : null;
  }

  normalizeIp(rawIp) {
    if (!rawIp || typeof rawIp !== 'string') return null;
    let ip = rawIp.trim();
    if (!ip) return null;

    if (ip.includes(',')) {
      [ip] = ip.split(',');
      ip = ip.trim();
    }

    if (ip.startsWith('::ffff:')) {
      ip = ip.slice('::ffff:'.length);
    }

    if (ip.startsWith('[') && ip.endsWith(']')) {
      ip = ip.slice(1, -1);
    }

    if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(ip)) {
      [ip] = ip.split(':');
    }

    return ip;
  }

  isPrivateIp(ip) {
    if (!ip) return true;

    const normalized = ip.toLowerCase();
    if (normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost') {
      return true;
    }

    if (normalized.startsWith('10.') || normalized.startsWith('192.168.') || normalized.startsWith('169.254.')) {
      return true;
    }

    if (/^172\.(1[6-9]|2\d|3[01])\./.test(normalized)) {
      return true;
    }

    if (normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:')) {
      return true;
    }

    return false;
  }

  getClientIpFromRequest(req) {
    const xForwardedFor = req.headers['x-forwarded-for'];
    const forwardedList = typeof xForwardedFor === 'string'
      ? xForwardedFor.split(',').map((item) => item.trim())
      : [];

    const candidates = [
      req.headers['cf-connecting-ip'],
      req.headers['x-real-ip'],
      ...forwardedList,
      req.ip,
      req.socket?.remoteAddress,
    ];

    for (const candidate of candidates) {
      const ip = this.normalizeIp(candidate);
      if (!ip || this.isPrivateIp(ip)) {
        continue;
      }
      return ip;
    }

    return null;
  }

  getCachedCountryByIp(ip) {
    if (!ip) return null;
    const cached = this.geoIpCache.get(ip);
    if (!cached) return null;

    if (Date.now() > cached.expiresAt) {
      this.geoIpCache.delete(ip);
      return null;
    }

    return cached.country;
  }

  setCachedCountryByIp(ip, country) {
    if (!ip || !country) return;
    this.geoIpCache.set(ip, {
      country,
      expiresAt: Date.now() + GEO_IP_CACHE_TTL,
    });
  }

  async fetchGeoDataFromIpApi(ip) {
    const apiKey = process.env.IPAPI_API_KEY?.trim();
    const endpoint = apiKey
      ? `https://ipapi.co/${ip}/json/?key=${encodeURIComponent(apiKey)}`
      : `https://ipapi.co/${ip}/json/`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      const response = await fetch(endpoint, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'illorac-geo-redirect/1.0',
        },
      });

      if (!response.ok) {
        this.log.warn('GeoIP API response not OK', { status: response.status, ip });
        return null;
      }

      const data = await response.json();
      if (data?.error) {
        this.log.warn('GeoIP API returned error payload', {
          ip,
          reason: data.reason || null,
          message: data.message || null,
        });
      }

      return data;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async fetchCountryCodeFromIpApi(ip) {
    const cachedCountry = this.getCachedCountryByIp(ip);
    if (cachedCountry) {
      return cachedCountry;
    }

    try {
      const data = await this.fetchGeoDataFromIpApi(ip);
      if (!data) return null;

      const country = this.normalizeCountryCode(data?.country_code);

      if (!country) {
        this.log.warn('GeoIP API returned invalid country', { ip, response: data });
        return null;
      }

      this.setCachedCountryByIp(ip, country);

      return country;
    } catch (error) {
      this.log.warn('GeoIP lookup failed', {
        ip,
        error: error?.message || 'Unknown error',
      });
      return null;
    }
  }

  securityMiddleware(app) {
    app.set('trust proxy', true);
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

    // Public endpoint for frontend geo-based domain routing decisions
    app.get('/geo-routing', async (req, res) => {
      const host = this.getRequestHost(req);
      const clientIp = this.getClientIpFromRequest(req);
      const hostEligible = GEO_SUPPORTED_HOSTS.includes(host);

      let country = this.normalizeCountryCode(req.cookies?.[GEO_COOKIE_NAME]);
      let source = country ? 'cookie' : 'none';

      if (!country && clientIp) {
        country = await this.fetchCountryCodeFromIpApi(clientIp);
        source = country ? 'ipapi' : 'unavailable';

        if (country) {
          const requestIsSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
          res.cookie(GEO_COOKIE_NAME, country, {
            maxAge: GEO_COOKIE_MAX_AGE,
            httpOnly: false,
            secure: requestIsSecure,
            sameSite: 'Lax',
          });
        }
      }

      const targetDomain = country === 'NL' ? 'illorac.nl' : 'illorac.com';
      const shouldRedirect = hostEligible && host !== targetDomain;

      res.set('Cache-Control', 'no-store');
      res.json({
        host,
        hostEligible,
        clientIp,
        country: country || 'UNKNOWN',
        source,
        targetDomain,
        shouldRedirect,
        targetUrl: shouldRedirect ? `https://${targetDomain}${req.originalUrl || '/'}` : null,
      });
    });

    // Debug endpoint for geo decision verification
    app.get('/debug-geo', async (req, res) => {
      const host = this.getRequestHost(req);
      const clientIp = this.getClientIpFromRequest(req);
      let geoData = null;

      if (clientIp) {
        try {
          geoData = await this.fetchGeoDataFromIpApi(clientIp);
        } catch (e) {
          geoData = { error: e.message };
        }
      }

      const country = this.normalizeCountryCode(req.cookies?.[GEO_COOKIE_NAME])
        || this.normalizeCountryCode(geoData?.country_code);
      const targetDomain = country === 'NL' ? 'illorac.nl' : 'illorac.com';
      const redirectEligibleHost = GEO_SUPPORTED_HOSTS.includes(host);

      res.json({
        clientIp,
        host,
        forwardedFor: req.headers['x-forwarded-for'] || null,
        forwardedHost: req.headers['x-forwarded-host'] || null,
        cfConnectingIp: req.headers['cf-connecting-ip'] || null,
        cookie: req.cookies?.[GEO_COOKIE_NAME] || 'NOT SET',
        geoData,
        usingIpApiKey: !!process.env.IPAPI_API_KEY,
        cacheHit: !!(clientIp && this.getCachedCountryByIp(clientIp)),
        redirectEligibleHost,
        redirectReason: redirectEligibleHost
          ? 'Host is eligible for geo redirect'
          : 'Host is not in GEO_SUPPORTED_HOSTS. Redirect middleware is skipped.',
        resolvedCountry: country || 'UNKNOWN',
        targetDomain,
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
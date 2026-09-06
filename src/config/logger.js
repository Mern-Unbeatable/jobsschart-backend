import winston from 'winston';

/**
 * Format timestamp as: YYYY-MM-DD HH:mm:ss.SSS ZZ (e.g., 2026-09-06 11:20:13.496 +0600)
 */
function formatTimestamp() {
  const now = new Date();

  // Pad helper
  const pad = (num, size = 2) => String(num).padStart(size, '0');

  const year = now.getFullYear();
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const hours = pad(now.getHours());
  const minutes = pad(now.getMinutes());
  const seconds = pad(now.getSeconds());
  const ms = pad(now.getMilliseconds(), 3);

  // Get timezone offset
  const offsetMs = now.getTimezoneOffset();
  const offsetHours = pad(Math.abs(Math.floor(offsetMs / 60)));
  const offsetMins = pad(Math.abs(offsetMs % 60));
  const offsetSign = offsetMs <= 0 ? '+' : '-';
  const timezone = `${offsetSign}${offsetHours}${offsetMins}`;

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms} ${timezone}`;
}

function formatConsoleTimestamp() {
  const now = new Date();
  const pad = (num, size = 2) => String(num).padStart(size, '0');

  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function formatConsoleLine(level, message) {
  const normalizedLevel = String(level).toUpperCase();
  return `[${formatConsoleTimestamp()}] ${normalizedLevel}: ${String(message)}`;
}

export class Logger {
  constructor(serviceName) {
    const env = process.env.NODE_ENV || 'development';
    const isProd = env === 'production';

    const fileFormat = winston.format.combine(
      winston.format.timestamp({ format: formatTimestamp }),
      winston.format.errors({ stack: true }),
      winston.format.json(),
    );

    this.winston = winston.createLogger({
      level: isProd ? 'info' : 'debug',
      transports: [
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
          format: fileFormat,
        }),
        new winston.transports.File({
          filename: 'logs/combined.log',
          format: fileFormat,
        }),
      ],
    });
  }

  info(message) {
    const text = String(message);
    console.log(formatConsoleLine('info', text));
    this.winston.info(text);
  }

  error(message, error) {
    const err = error instanceof Error ? error : undefined;
    const text = err?.stack ? `${String(message)}: ${err.message}` : String(message);
    console.log(formatConsoleLine('error', text));
    this.winston.error(text);
  }

  warn(message) {
    const text = String(message);
    console.log(formatConsoleLine('warn', text));
    this.winston.warn(text);
  }

  debug(message) {
    const text = String(message);
    console.log(formatConsoleLine('debug', text));
    this.winston.debug(text);
  }

  // HTTP request logger - called by middleware
  http(message) {
    console.log(formatConsoleLine('info', String(message)));
    this.winston.info(String(message));
  }
}

/**
 * Startup status logger for clean server startup output
 * Shows only essential information without verbose internal logs
 */
export class StartupLogger {
  constructor() {
    this.status = {
      environment: null,
      port: null,
      databaseConnected: false,
      seedExecuted: false,
      errors: [],
    };
  }

  setEnvironment(env) {
    this.status.environment = env;
  }

  setPort(port) {
    this.status.port = port;
  }

  setDatabaseConnected(connected) {
    this.status.databaseConnected = connected;
  }

  setSeedExecuted(executed) {
    this.status.seedExecuted = executed;
  }

  addError(message) {
    this.status.errors.push(message);
  }

  print() {
    console.log(); // blank line
    if (this.status.errors.length > 0) {
      this.status.errors.forEach((error) => {
        console.log(`  \u2717 ${error}`);
      });
      console.log();
      return;
    }

    if (this.status.port) {
      console.log(`  \u2713 Server running on port ${this.status.port}`);
    }
    if (this.status.environment) {
      console.log(`  \u2713 Environment: ${this.status.environment}`);
    }
    if (this.status.databaseConnected) {
      console.log(`  \u2713 Database connected`);
    }
    if (this.status.seedExecuted) {
      console.log(`  \u2713 Seed completed successfully`);
    }
    console.log();
  }
}

/**
 * Creates a custom HTTP logging middleware that logs clean, compact request/response information.
 * Logs only: method, status code, path, and response time.
 * No sensitive data (headers, tokens, etc.) is logged.
 *
 * @param {Logger} logger - The logger instance to use
 * @returns {Function} Express middleware function
 */
export function createHttpLoggingMiddleware(logger) {
  return (req, res, next) => {
    const startTime = process.hrtime.bigint();
    const method = req.method;
    const path = req.originalUrl || req.url;

    // Capture the original res.end method
    const originalEnd = res.end;

    // Override res.end to log after response is complete
    res.end = function (...args) {
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1_000_000; // Convert nanoseconds to milliseconds
      const statusCode = res.statusCode || 200;

      // Determine log level based on status code
      let logLevel = 'info'; // 2xx
      if (statusCode >= 400 && statusCode < 500) {
        logLevel = 'warn'; // 4xx
      } else if (statusCode >= 500) {
        logLevel = 'error'; // 5xx
      }

      // Log the request in compact format without JSON metadata
      const logMessage = `${method} ${statusCode} ${path} - ${durationMs.toFixed(3)} ms`;
      console.log(formatConsoleLine(logLevel, logMessage));

      // Call the original end method
      return originalEnd.apply(res, args);
    };

    next();
  };
}

// src/shared/globals/helpers/auth-middleware.js
import { Logger } from "../../../config/logger.js";
import jwt from 'jsonwebtoken';
import { config } from "../../../config/config.js";
import { UnauthorizedError, NotFoundError, ForbiddenError } from "./error-handler.js";
import { authService } from "../../../features/auth/auth.services.js";

class AuthMiddleware {
  constructor() {
    this.log = new Logger('AuthMiddleware');
  }

  protect = async (req, _res, next) => {
    try {
      let token;

      // Check for token in Authorization header
      if (req.headers.authorization?.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
      }

      // Check for token in cookies
      if (!token && req.cookies?.accessToken) {
        token = req.cookies.accessToken;
      }

      if (!token) {
        throw new UnauthorizedError('Access token missing. Please login.');
      }

      let payload;

      try {
        payload = jwt.verify(token, config.JWT_TOKEN);
        this.log.debug(`Token payload: ${JSON.stringify(payload)}`);
      } catch (err) {
        if (err.name === 'TokenExpiredError') {
          throw new UnauthorizedError('Token expired. Please refresh your token.');
        }
        if (err.name === 'JsonWebTokenError') {
          throw new UnauthorizedError('Invalid token format.');
        }
        throw new UnauthorizedError('Authentication failed.');
      }

      const userId = payload.id;

      if (!userId) {
        throw new UnauthorizedError('Invalid token payload.');
      }

      // Get user from database
      const user = await authService.getUserById(userId);

      if (!user) {
        this.log.warn(`User not found for ID: ${userId}`);
        throw new NotFoundError('User not found.');
      }

      this.log.debug(`User found: ${user.id}, Role: ${user.role}, Status: ${user.status}`);

      // Check user status
      if (user.status === 'SUSPENDED') {
        throw new ForbiddenError('Your account has been suspended. Please contact support.');
      }

      if (user.status === 'BANNED') {
        throw new ForbiddenError('Your account has been banned.');
      }

      // Attach user to request
      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        username: user.username,
        status: user.status,
        isVerified: user.isVerified,
        name: user.name,
        avatar: user.avatar,
      };

      this.log.debug(`User authenticated: ${userId} with role: ${user.role}`);
      next();
    } catch (error) {
      this.log.error(`Auth middleware error: ${error.message}`);
      next(error);
    }
  };

  authorize = (...allowedRoles) => {
    return (req, _res, next) => {
      if (!req.user) {
        return next(new UnauthorizedError('Authentication required.'));
      }

      if (!allowedRoles.includes(req.user.role)) {
        this.log.warn(`Access denied for user ${req.user.id} with role ${req.user.role}. Required roles: ${allowedRoles.join(', ')}`);
        return next(new ForbiddenError(`Access denied. ${allowedRoles.join(' or ')} role required.`));
      }

      this.log.debug(`User ${req.user.id} authorized with role ${req.user.role}`);
      next();
    };
  };

  isAdmin = (req, _res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required.'));
    }

    if (req.user.role !== 'ADMIN') {
      this.log.warn(`Admin access denied for user ${req.user.id} with role ${req.user.role}`);
      return next(new ForbiddenError('Admin access required.'));
    }

    this.log.debug(`Admin access granted for user ${req.user.id}`);
    next();
  };

  isConsultant = (req, _res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required.'));
    }

    if (req.user.role !== 'CONSULTANT' && req.user.role !== 'ADMIN') {
      return next(new ForbiddenError('Consultant access required.'));
    }

    next();
  };

  isUser = (req, _res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required.'));
    }

    if (req.user.role !== 'USER' && req.user.role !== 'CONSULTANT' && req.user.role !== 'ADMIN') {
      return next(new ForbiddenError('User access required.'));
    }

    next();
  };

  optionalAuth = async (req, _res, next) => {
    try {
      let token;

      if (req.headers.authorization?.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
      }

      if (!token && req.cookies?.accessToken) {
        token = req.cookies.accessToken;
      }

      if (token) {
        try {
          const payload = jwt.verify(token, config.JWT_TOKEN);
          const userId = payload.id;

          if (userId) {
            const user = await authService.getUserById(userId);
            if (user && user.status === 'ACTIVE') {
              req.user = {
                id: user.id,
                email: user.email,
                role: user.role,
                username: user.username,
                status: user.status,
                isVerified: user.isVerified,
                name: user.name,
                avatar: user.avatar,
              };
              this.log.debug(`Optional auth successful for user: ${userId}`);
            }
          }
        } catch (err) {
          this.log.debug('Optional auth: Invalid token provided');
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  };

  // Additional helper methods
  isSameUserOrAdmin = (req, _res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required.'));
    }

    const targetUserId = req.params.id || req.body.userId;

    if (req.user.role !== 'ADMIN' && req.user.id !== targetUserId) {
      return next(new ForbiddenError('You can only access your own data.'));
    }

    next();
  };

  isAdminOrConsultant = (req, _res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required.'));
    }

    if (req.user.role !== 'ADMIN' && req.user.role !== 'CONSULTANT') {
      return next(new ForbiddenError('Admin or Consultant access required.'));
    }

    next();
  };
}

export const authMiddleware = new AuthMiddleware();
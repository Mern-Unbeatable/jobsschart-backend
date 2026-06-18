import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../../../config/config.js';

export class Helpers {
  static hashPassword(password) {
    return bcrypt.hash(password, 10);
  }

  static comparePassword(password, hashedPassword) {
    return bcrypt.compare(password, hashedPassword);
  }

  static generateAccessToken(payload) {
    return jwt.sign(payload, config.JWT_TOKEN, {
      expiresIn: '7d',
    });
  }

  static generateRefreshToken(payload) {
    return jwt.sign(payload, config.JWT_REFRESH_TOKEN, {
      expiresIn: '7d',
    });
  }

  static verifyRefreshToken(token) {
    try {
      return jwt.verify(token, config.JWT_REFRESH_TOKEN);
    } catch (error) {
      return null;
    }
  }
}
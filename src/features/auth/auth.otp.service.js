import { authService } from './auth.services.js';
import { Helpers } from '../../shared/globals/helpers/helpers.js';
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} from '../../shared/globals/helpers/error-handler.js';

class AuthOtpService {
  async verifyOtpFlow({ email, otp, expectedPurpose }) {
    const user = await authService.getUserByEmail(email);
    if (!user) throw new NotFoundError('User not found');

    const result = await authService.verifyOtp(user.id, otp);

    if (!result.valid) throw new BadRequestError(result.reason);

    if (result.purpose !== expectedPurpose) {
      throw new BadRequestError('Invalid OTP purpose');
    }

    await authService.clearOtp(user.id);

    return user;
  }

  async issueTokens(user) {
    return {
      accessToken: Helpers.generateAccessToken({
        id: user.id,
        email: user.email,
        role: user.role,
      }),
      refreshToken: Helpers.generateRefreshToken({ id: user.id }),
    };
  }
}

export const authOtpService = new AuthOtpService();
import { config } from '../../config/config.js';
import { Logger } from '../../config/logger.js';
import { catchAsync } from '../../shared/globals/decorators/catch-async.js';
import { Helpers } from '../../shared/globals/helpers/helpers.js';
import { ResponseHandler } from '../../shared/globals/helpers/response.handler.js';
import { mailTransport } from '../../shared/services/mail.transport.js';
import { authService } from './auth.services.js';
import { authOtpService } from './auth.otp.service.js';
import {
  signupSchema,
  signinSchema,
  changePasswordSchema,
  forgotPasswordSchema,
} from './auth.validation.js';
import { verificationStore } from './auth.verification.store.js';

class AuthController {
  constructor() {
    this.log = new Logger('AuthController');
  }

  _setAuthCookies(res, accessToken, refreshToken) {
    const secure = config.NODE_ENV !== 'development';
    res.cookie('accessToken', accessToken, {
      httpOnly: true, secure, sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true, secure, sameSite: 'lax',
      maxAge: 8 * 24 * 60 * 60 * 1000,
    });
  }

  signUp = catchAsync(async (req, res) => {
    const validatedData = signupSchema.parse(req.body);
    const { name, email, password, role, phone, bio, location, language, avatar } = validatedData;
    this.log.info(`Signup attempt for email: ${email}`);

    const existingUser = await authService.getUserByEmail(email);
    if (existingUser) throw new Error('Email is already in use');

    const hashedPassword = await authService.hashPassword(password);
    const user = await authService.createUser({
      name, email, password: hashedPassword,
      role: role || 'USER', phone, bio, location, language, avatar,
    });

    const tokens = {
      accessToken: Helpers.generateAccessToken({ id: user.id, email: user.email, role: user.role }),
      refreshToken: Helpers.generateRefreshToken({ id: user.id }),
    };

    await authService.updateRefreshToken(user.id, tokens.refreshToken);
    this._setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    this.log.info(`User registered: ${user.email} (${user.id})`);

    ResponseHandler.created(res, {
      message: 'Registration successful',
      data: {
        user: {
          id: user.id, email: user.email, username: user.username,
          name: user.name, role: user.role, status: user.status,
          isVerified: user.isVerified, phone: user.phone, bio: user.bio,
          location: user.location, language: user.language,
          avatar: user.avatar, wallet: user.wallet, consultant: user.consultant,
        },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    });
  });

  signIn = catchAsync(async (req, res) => {
    const { email, password } = signinSchema.parse(req.body);
    this.log.info(`Login attempt: ${email}`);

    const user = await authService.getUserByEmailWithPassword(email);
    if (!user) throw new Error('Invalid email or password');
    if (user.status === 'SUSPENDED') throw new Error('Your account has been suspended. Please contact support.');
    if (user.status === 'BANNED') throw new Error('Your account has been banned.');

    const isMatch = await authService.comparePassword(password, user.password);
    if (!isMatch) throw new Error('Invalid email or password');

    const tokens = {
      accessToken: Helpers.generateAccessToken({ id: user.id, email: user.email, role: user.role }),
      refreshToken: Helpers.generateRefreshToken({ id: user.id }),
    };

    await authService.updateRefreshToken(user.id, tokens.refreshToken);
    this._setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

    const { password: _, ...userWithoutPassword } = user;
    this.log.info(`User logged in: ${user.email} (${user.id})`);

    ResponseHandler.success(res, {
      message: 'Login successful',
      data: { user: userWithoutPassword, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken },
    });
  });

  refreshToken = catchAsync(async (req, res) => {
    let refreshToken = null;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) refreshToken = authHeader.substring(7);
    if (!refreshToken) refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) throw new Error('Refresh token required');

    const decoded = Helpers.verifyRefreshToken(refreshToken);
    if (!decoded?.id) throw new Error('Invalid or expired refresh token');

    const user = await authService.getUserById(decoded.id);
    if (!user) throw new Error('User not found');
    if (user.refreshTokens !== refreshToken) throw new Error('Invalid refresh token');

    const newAccessToken = Helpers.generateAccessToken({ id: user.id, email: user.email, role: user.role });
    const newRefreshToken = Helpers.generateRefreshToken({ id: user.id });

    await authService.updateRefreshToken(user.id, newRefreshToken);
    this._setAuthCookies(res, newAccessToken, newRefreshToken);
    this.log.info(`Token refreshed for user: ${user.id}`);

    ResponseHandler.success(res, {
      message: 'Token refreshed successfully',
      data: {
        accessToken: newAccessToken, refreshToken: newRefreshToken,
        user: { id: user.id, email: user.email, username: user.username, name: user.name, role: user.role },
      },
    });
  });

  signOut = catchAsync(async (req, res) => {
    const userId = req.user?.id;
    if (userId) await authService.clearRefreshToken(userId);
    this.log.info(`Signout for user: ${userId || 'unknown'}`);

    const cookieOptions = {
      httpOnly: true, secure: config.NODE_ENV !== 'development', sameSite: 'lax', path: '/',
    };
    res.clearCookie('accessToken', cookieOptions);
    res.clearCookie('refreshToken', cookieOptions);
    ResponseHandler.success(res, { message: 'Logged out successfully' });
  });

  changePassword = catchAsync(async (req, res) => {
    if (!req.user?.id) throw new Error('User not authenticated');
    const { currentPassword, newPassword, confirmPassword } = changePasswordSchema.parse(req.body);
    if (newPassword !== confirmPassword) throw new Error("Passwords don't match");

    const userId = req.user.id;
    const user = await authService.getUserByIdWithPassword(userId);
    if (!user) throw new Error('User not found');

    const isMatch = await authService.comparePassword(currentPassword, user.password);
    if (!isMatch) throw new Error('Current password is incorrect');

    const hashedPassword = await authService.hashPassword(newPassword);
    await authService.updatePassword(userId, hashedPassword);
    this.log.info(`Password changed for user: ${userId}`);
    ResponseHandler.updated(res, { message: 'Password changed successfully' });
  });

  forgotPassword = catchAsync(async (req, res) => {
    const { email } = forgotPasswordSchema.parse(req.body);
    this.log.info(`Forgot password request for: ${email}`);

    const user = await authService.getUserByEmailWithPassword(email);
    if (!user) {
      this.log.warn(`Forgot password: no account for ${email}`);
      throw new Error('No account found with this email address');
    }


    const userId = user.id;
    const userName = user.name || '';
    const userEmail = email;

    this.log.info(`Sending OTP to userId=${userId} email=${userEmail} name="${userName}"`);

    verificationStore.clearVerified(userEmail);

    const otp = authService.generateOtp();
    await authService.saveOtp(userId, otp, 'password_reset');

    try {
      await mailTransport.sendOtpEmail(userEmail, otp, userName, 'password_reset');
      this.log.info(`OTP sent to: ${userEmail}`);
    } catch (emailError) {
      this.log.error(`SMTP error for ${userEmail}: [${emailError.code}] ${emailError.message}`);
      if (config.NODE_ENV === 'development') {
        throw new Error(`Email failed: [${emailError.code}] ${emailError.message}`);
      }
      throw new Error('Failed to send reset code. Please try again later.');
    }

    ResponseHandler.success(res, {
      message: 'A password reset code has been sent to your email address.',
      data: {
        email: userEmail,
        ...(config.NODE_ENV === 'development' && { otp }),
      },
    });
  });

  verifyResetOtp = catchAsync(async (req, res) => {
    const { otp, email } = req.body;
    if (!email) throw new Error('Email is required');
    if (!otp) throw new Error('OTP is required');

    this.log.info(`OTP verification for: ${email}`);

    const user = await authOtpService.verifyOtpFlow({
      email, otp, expectedPurpose: 'password_reset',
    });

    verificationStore.setVerified(email);

    ResponseHandler.success(res, {
      message: 'OTP verified successfully. You can now reset your password.',
      data: { email: user.email || email, verified: true },
    });
  });

  resetPassword = catchAsync(async (req, res) => {
    const { newPassword, confirmPassword, email } = req.body;

    if (!email) throw new Error('Email is required');
    if (!newPassword || newPassword.length < 6) throw new Error('Password must be at least 6 characters');
    if (newPassword !== confirmPassword) throw new Error("Passwords don't match");

    if (!verificationStore.isVerified(email)) {
      throw new Error('Please verify your OTP first. OTP verification may have expired.');
    }

    const user = await authService.getUserByEmailWithPassword(email);
    if (!user) throw new Error('User not found');

    const hashedPassword = await authService.hashPassword(newPassword);
    await authService.updatePassword(user.id, hashedPassword);

    await authService.clearOtp(user.id);
    verificationStore.clearVerified(email);
    mailTransport
      .sendPasswordChangedEmail(email, user.name || '')
      .catch((err) => this.log.error(`Password changed email failed: ${err.message}`));

    this.log.info(`Password reset for user: ${user.id}`);

    ResponseHandler.success(res, {
      message: 'Password reset successfully. You can now login with your new password.',
    });
  });
}

export const authController = new AuthController();
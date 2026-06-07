import { config } from '../../config/config.js';
import { Logger } from '../../config/logger.js';
import { catchAsync } from '../../shared/globals/decorators/catch-async.js';
import { ResponseHandler } from '../../shared/globals/helpers/response.handler.js';
import { userService } from './user.services.js';

import {
  updateProfileSchema,
  adjustCreditsSchema,
  setVerifiedSchema,
  updateUserStatusSchema,
  updateUserRoleSchema,
} from './user.validation.js';

class UserController {
  constructor() {
    this.log = new Logger('UserController');
  }

  getMe = catchAsync(async (req, res) => {
    const userId = req.user.id;
    const user = await userService.getFullProfile(userId);
    if (!user) throw new Error('User not found');

    ResponseHandler.success(res, {
      message: 'Profile fetched successfully',
      data: { user },
    });
  });

  getMyStats = catchAsync(async (req, res) => {
    const userId = req.user.id;
    const stats = await userService.getUserStats(userId);

    ResponseHandler.success(res, {
      message: 'User statistics fetched successfully',
      data: { stats },
    });
  });

  getMyCreditHistory = catchAsync(async (req, res) => {
    const userId = req.user.id;
    const result = await userService.getCreditHistory(userId, req.query);

    ResponseHandler.success(res, {
      message: 'Credit history fetched successfully',
      data: result,
    });
  });

  updateProfile = catchAsync(async (req, res) => {
    const userId = req.user.id;

    // Debug logs — remove after confirming it works
    this.log.info(`req.file: ${JSON.stringify(req.file)}`);
    this.log.info(`req.body.avatar: ${req.body.avatar}`);

    const profileData = updateProfileSchema.parse(req.body);

    this.log.info(`Updating profile for user: ${userId}`);

    const updated = await userService.updateProfile(userId, profileData);

    ResponseHandler.updated(res, {
      message: 'Profile updated successfully',
      data: { user: updated },
    });
  });

  deleteMe = catchAsync(async (req, res) => {
    const userId = req.user.id;
    this.log.info(`Self-delete for user: ${userId}`);

    await userService.deleteUser(userId);

    const cookieOptions = {
      httpOnly: true,
      secure: config.NODE_ENV !== 'development',
      sameSite: 'lax',
      path: '/',
    };
    res.clearCookie('accessToken', cookieOptions);
    res.clearCookie('refreshToken', cookieOptions);

    ResponseHandler.success(res, {
      message: 'Your account has been deleted successfully',
    });
  });

  // ─── Admin routes ────────────────────────────────────────────────────────────

  getAllUsers = catchAsync(async (req, res) => {
    this.log.info('Admin: fetching all users');
    const result = await userService.getAllUsers(req.query);

    ResponseHandler.success(res, {
      message: 'Users fetched successfully',
      data: result,
    });
  });

  getAdminStats = catchAsync(async (_req, res) => {
    this.log.info('Admin: fetching user stats');
    const stats = await userService.getAdminUserStats();

    ResponseHandler.success(res, {
      message: 'User statistics fetched successfully',
      data: { stats },
    });
  });

  getUserById = catchAsync(async (req, res) => {
    const { id } = req.params;
    this.log.info(`Admin: fetching user ${id}`);

    const user = await userService.getUserWithDetails(id);
    if (!user) throw new Error('User not found');

    ResponseHandler.success(res, {
      message: 'User fetched successfully',
      data: { user },
    });
  });



  updateUserStatus = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { status } = updateUserStatusSchema.parse(req.body);

    this.log.info(`Admin: updating user ${id} status to ${status}`);

    const user = await userService.updateUserStatus(id, status);

    ResponseHandler.updated(res, {
      message: `User status updated to ${status} successfully`,
      data: { user },
    });
  });

  updateUserRole = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { role } = updateUserRoleSchema.parse(req.body);

    if (id === req.user.id && role !== req.user.role) {
      throw new Error('You cannot change your own role');
    }

    this.log.info(`Admin: updating user ${id} role to ${role}`);

    const user = await userService.updateUserRole(id, role);

    ResponseHandler.updated(res, {
      message: `User role updated to ${role} successfully`,
      data: { user },
    });
  });

  adjustCredits = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { amount, type, description } = adjustCreditsSchema.parse(req.body);

    this.log.info(`Admin: adjust credits for user ${id}: ${amount > 0 ? '+' : ''}${amount} (${type})`);

    const result = await userService.adjustCredits(id, amount, type, description);

    ResponseHandler.updated(res, {
      message: `Credits adjusted by ${amount > 0 ? '+' : ''}${amount} successfully`,
      data: result,
    });
  });

  deleteUser = catchAsync(async (req, res) => {
    const { id } = req.params;

    if (id === req.user.id) {
      throw new Error('Use DELETE /me to delete your own account');
    }

    this.log.info(`Admin: deleting user ${id}`);

    await userService.deleteUser(id);

    ResponseHandler.success(res, {
      message: 'User deleted successfully',
    });
  });
}

export const userController = new UserController();
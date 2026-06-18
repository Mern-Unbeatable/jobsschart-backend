import express from 'express';
import { authMiddleware } from '../../shared/globals/helpers/auth-middleware.js';
import { userController } from './user.controller.js';
import { uploadSingleImage } from '../../shared/upload/index.js';

const router = express.Router();
router.use(authMiddleware.protect);


router.get('/me', userController.getMe);

router.patch('/me', uploadSingleImage('avatar', 'avatars'), userController.updateProfile);

router.delete('/me', userController.deleteMe);
router.get('/me/stats', userController.getMyStats);
router.get('/me/credits', userController.getMyCreditHistory);

//  Admin only 

router.get(
    '/admin/users',
    authMiddleware.authorize('ADMIN'),
    userController.getAllUsers
);


router.get(
    '/admin/stats',
    authMiddleware.authorize('ADMIN'),
    userController.getAdminStats
);

router.get(
    '/admin/users/:id',
    authMiddleware.authorize('ADMIN'),
    userController.getUserById
);


router.patch(
    '/admin/users/:id/status',
    authMiddleware.authorize('ADMIN'),
    userController.updateUserStatus
);

router.patch(
    '/admin/users/:id/role',
    authMiddleware.authorize('ADMIN'),
    userController.updateUserRole
);

router.patch(
    '/admin/users/:id/credits',
    authMiddleware.authorize('ADMIN'),
    userController.adjustCredits
);

router.delete(
    '/admin/users/:id',
    authMiddleware.authorize('ADMIN'),
    userController.deleteUser
);

export const userRoutes = router;  
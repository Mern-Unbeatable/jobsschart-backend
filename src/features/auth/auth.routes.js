import express from 'express';
import { authMiddleware } from '../../shared/globals/helpers/auth-middleware.js';
import { authController } from './auth.controller.js';
import { uploadSingleImage } from '../../shared/upload/index.js';

const router = express.Router();

router.post('/signup', uploadSingleImage("avatar", "users"), authController.signUp);
router.post('/signin', authController.signIn);
router.post('/refresh-token', authController.refreshToken);

router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/logout', authMiddleware.protect, authController.signOut);
router.patch('/change-password', authMiddleware.protect, authController.changePassword);
router.post('/verify-reset-otp', authController.verifyResetOtp);
export const authRoutes = router;
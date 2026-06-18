// src/features/package/package.routes.js
import express from 'express';
import { authMiddleware } from '../../shared/globals/helpers/auth-middleware.js';
import { packageController } from './package.controller.js';

const router = express.Router();

// ========== PUBLIC ROUTES ==========
router.get('/', packageController.getAllPackages);
router.get('/active', packageController.getActivePackages);
router.get('/slug/:slug', packageController.getPackageBySlug);
router.get('/:id', packageController.getPackageById);

// ========== ADMIN ONLY ROUTES ==========
router.post(
  '/',
  authMiddleware.protect,
  authMiddleware.authorize('ADMIN'),
  packageController.createPackage
);

router.patch(
  '/:id',
  authMiddleware.protect,
  authMiddleware.authorize('ADMIN'),
  packageController.updatePackage
);

router.delete(
  '/:id',
  authMiddleware.protect,
  authMiddleware.authorize('ADMIN'),
  packageController.deletePackage
);

export const packageRoutes = router;
// src/features/order/order.routes.js
import express from 'express';
import { authMiddleware } from '../../shared/globals/helpers/auth-middleware.js';
import { orderController } from './order.controller.js';

const router = express.Router();

router.use(authMiddleware.protect);

// ══════════════════════════════════════════════════════════════════════════════
// USER ROUTES
// ══════════════════════════════════════════════════════════════════════════════
// GET   /orders/me            → আমার সব order
// GET   /orders/:id           → একটা order এর details
// PATCH /orders/:id/cancel    → Order cancel করো

router.get('/me', orderController.getMyOrders);
router.get('/:id', orderController.getOrderById);
router.patch('/:id/cancel', orderController.cancelOrder);

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ══════════════════════════════════════════════════════════════════════════════
router.get(
    '/admin/all',
    authMiddleware.authorize('ADMIN'),
    orderController.getAllOrders
);
router.get(
    '/admin/stats',
    authMiddleware.authorize('ADMIN'),
    orderController.getOrderStats
);
router.patch(
    '/admin/:id/status',
    authMiddleware.authorize('ADMIN'),
    orderController.updateOrderStatus
);

export const orderRoutes = router;
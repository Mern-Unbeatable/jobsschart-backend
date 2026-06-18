// src/features/order/order.controller.js
import { catchAsync } from '../../shared/globals/decorators/catch-async.js';
import { ResponseHandler } from '../../shared/globals/helpers/response.handler.js';
import { orderService } from './order.service.js';
import { Logger } from '../../config/logger.js';
import { updateOrderStatusSchema, getOrdersQuerySchema } from './order.validation.js';

const log = new Logger('OrderController');

class OrderController {
    // GET /api/v1/orders/me
    getMyOrders = catchAsync(async (req, res) => {
        const query = getOrdersQuerySchema.parse(req.query);
        const result = await orderService.getMyOrders(req.user.id, query);
        ResponseHandler.success(res, { message: 'Your orders fetched', data: result });
    });

    // GET /api/v1/orders/:id
    getOrderById = catchAsync(async (req, res) => {
        const order = await orderService.getOrderById(req.params.id, req.user.id, req.user.role);
        ResponseHandler.success(res, { message: 'Order fetched', data: { order } });
    });

    // PATCH /api/v1/orders/:id/cancel
    cancelOrder = catchAsync(async (req, res) => {
        log.info(`User ${req.user.id} cancelling order ${req.params.id}`);
        const order = await orderService.cancelOrder(req.params.id, req.user.id, req.user.role);
        ResponseHandler.success(res, { message: 'Order cancelled, stock restored', data: { order } });
    });

    // GET /api/v1/orders/admin/all  (ADMIN)
    getAllOrders = catchAsync(async (req, res) => {
        const query = getOrdersQuerySchema.parse(req.query);
        const result = await orderService.getAllOrders(query);
        ResponseHandler.success(res, { message: 'All orders fetched', data: result });
    });

    // PATCH /api/v1/orders/admin/:id/status  (ADMIN)
    updateOrderStatus = catchAsync(async (req, res) => {
        const { status } = updateOrderStatusSchema.parse(req.body);
        const order = await orderService.updateOrderStatus(req.params.id, status);
        ResponseHandler.updated(res, { message: `Order status → ${status}`, data: { order } });
    });

    // GET /api/v1/orders/admin/stats  (ADMIN)
    getOrderStats = catchAsync(async (req, res) => {
        const stats = await orderService.getOrderStats();
        ResponseHandler.success(res, { message: 'Order stats fetched', data: { stats } });
    });
}

export const orderController = new OrderController();
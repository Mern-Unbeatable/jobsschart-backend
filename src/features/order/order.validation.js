// src/features/order/order.validation.js
import { z } from 'zod';

export const updateOrderStatusSchema = z.object({
    status: z.enum(
        ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'],
        { message: 'Invalid order status' }
    ),
});

export const getOrdersQuerySchema = z.object({
    page: z.string().optional().transform((v) => parseInt(v) || 1),
    limit: z.string().optional().transform((v) => Math.min(parseInt(v) || 20, 100)),
    status: z.enum(['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED']).optional(),
    paymentStatus: z.enum(['PENDING', 'SUCCESS']).optional(),
    userId: z.string().uuid().optional(),
    search: z.string().optional(),
});

import { prisma } from '../../config/db.js';
import { Logger } from '../../config/logger.js';
import { NotFoundError, ConflictError, ForbiddenError } from '../../shared/globals/helpers/error-handler.js';

const log = new Logger('OrderService');

class OrderService {

    async getMyOrders(userId, queryParams = {}) {
        const page = parseInt(queryParams.page) || 1;
        const limit = Math.min(parseInt(queryParams.limit) || 20, 100);
        const skip = (page - 1) * limit;

        const where = { userId };
        if (queryParams.status) where.status = queryParams.status;

        const [orders, total] = await Promise.all([
            prisma.order.findMany({
                where,
                include: {
                    items: {
                        include: {
                            product: {
                                select: {
                                    id: true,
                                    name: true,
                                    gallery: true,
                                    price: true,
                                    slug: true
                                }
                            },
                        },
                    },
                    payment: { select: { id: true, status: true, createdAt: true, stripeSessionId: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma.order.count({ where }),
        ]);
        const transformedOrders = orders.map(order => ({
            ...order,
            shippingAddress: order.shippingAddress || {},
            items: order.items.map(item => ({
                ...item,
                product: {
                    ...item.product,
                    image: item.product.gallery?.[0] || null
                }
            }))
        }));

        return {
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            },
            orders: transformedOrders
        };
    }


    async getOrderById(id, userId, userRole) {
        const order = await prisma.order.findUnique({
            where: { id },
            include: {
                user: { select: { id: true, name: true, email: true } },
                items: {
                    include: {
                        product: {
                            select: {
                                id: true,
                                name: true,
                                slug: true,
                                description: true,
                                price: true,
                                gallery: true,
                                stock: true,
                                isActive: true
                            }
                        }
                    }
                },
                payment: true,
            },
        });

        if (!order) throw new NotFoundError('Order not found');
        if (userRole !== 'ADMIN' && order.userId !== userId) {
            throw new ForbiddenError('You can only view your own orders');
        }

        const transformedOrder = {
            ...order,
            shippingAddress: order.shippingAddress || {},
            items: order.items.map(item => ({
                ...item,
                product: {
                    ...item.product,
                    image: item.product.gallery?.[0] || null
                }
            }))
        };

        return transformedOrder;
    }


    async cancelOrder(id, userId, userRole) {
        const order = await prisma.order.findUnique({
            where: { id },
            include: { items: true },
        });
        if (!order) throw new NotFoundError('Order not found');
        if (userRole !== 'ADMIN' && order.userId !== userId) {
            throw new ForbiddenError('You can only cancel your own orders');
        }
        if (!['PROCESSING'].includes(order.status)) {
            throw new ConflictError(
                `Cannot cancel order with status: ${order.status}. Only PROCESSING orders can be cancelled.`
            );
        }

        // Return Stock
        await prisma.$transaction(async (tx) => {
            await tx.order.update({ where: { id }, data: { status: 'CANCELLED' } });

            for (const item of order.items) {
                await tx.product.update({
                    where: { id: item.productId },
                    data: { stock: { increment: item.quantity } },
                });
            }
        });

        log.info(`Order ${id} cancelled — stock restored`);
        return await prisma.order.findUnique({ where: { id } });
    }


    async getAllOrders(queryParams = {}) {
        const page = parseInt(queryParams.page) || 1;
        const limit = Math.min(parseInt(queryParams.limit) || 20, 100);
        const skip = (page - 1) * limit;

        const where = {};
        if (queryParams.status) where.status = queryParams.status;
        if (queryParams.paymentStatus) where.paymentStatus = queryParams.paymentStatus;
        if (queryParams.userId) where.userId = queryParams.userId;

        if (queryParams.search) {
            where.OR = [
                { user: { name: { contains: queryParams.search, mode: 'insensitive' } } },
                { user: { email: { contains: queryParams.search, mode: 'insensitive' } } },
            ];
        }

        const [orders, total] = await Promise.all([
            prisma.order.findMany({
                where,
                include: {
                    user: { select: { id: true, name: true, email: true } },
                    items: {
                        include: {
                            product: {
                                select: {
                                    id: true,
                                    name: true,
                                    gallery: true,
                                    price: true,
                                    slug: true
                                }
                            }
                        }
                    },
                    payment: { select: { id: true, status: true, amount: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma.order.count({ where }),
        ]);


        const transformedOrders = orders.map(order => ({
            ...order,
            shippingAddress: order.shippingAddress || {},
            items: order.items.map(item => ({
                ...item,
                product: {
                    ...item.product,
                    image: item.product.gallery?.[0] || null
                }
            }))
        }));

        return {
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            },
            orders: transformedOrders
        };
    }


    async updateOrderStatus(id, newStatus) {
        const order = await prisma.order.findUnique({
            where: { id },
            select: {
                id: true,
                status: true,
                userId: true,
                createdAt: true
            },
        });

        if (!order) {
            log.error(`Order not found with ID: ${id}`);
            throw new NotFoundError(`Order not found with ID: ${id}`);
        }

        log.info(`Current order status: ${order.status}, attempting to change to: ${newStatus}`);

        const validTransitions = {
            'PENDING': ['PROCESSING', 'CANCELLED'],
            'PROCESSING': ['SHIPPED', 'CANCELLED'],
            'SHIPPED': ['DELIVERED'],
            'DELIVERED': [],
            'CANCELLED': [],
        };

        const allowedStatuses = validTransitions[order.status];

        if (!allowedStatuses || !allowedStatuses.includes(newStatus)) {
            throw new ConflictError(
                `Cannot change status from ${order.status} to ${newStatus}. ` +
                `Allowed transitions: ${allowedStatuses?.join(', ') || 'none'}`
            );
        }

        const updated = await prisma.order.update({
            where: { id },
            data: { status: newStatus },
            select: {
                id: true,
                status: true,
                userId: true,
                totalAmount: true,
                paymentStatus: true,
                updatedAt: true
            }
        });

        log.info(` Order ${id}: ${order.status} → ${newStatus}`);
        return updated;
    }


    async getOrderStats() {
        const [total, byStatus, revenue] = await Promise.all([
            prisma.order.count(),
            prisma.order.groupBy({
                by: ['status'],
                _count: { id: true },
                _sum: { totalAmount: true },
            }),
            prisma.order.aggregate({
                where: { paymentStatus: 'SUCCESS' },
                _sum: { totalAmount: true },
                _count: { id: true },
            }),
        ]);

        return {
            totalOrders: total,
            totalRevenue: Number(revenue._sum.totalAmount || 0),
            paidOrders: revenue._count.id,
            byStatus: byStatus.reduce((acc, item) => {
                acc[item.status] = {
                    count: item._count.id,
                    amount: Number(item._sum.totalAmount || 0),
                };
                return acc;
            }, {}),
        };
    }


    async getOrderByOrderNumber(orderNumber, userId, userRole) {
        const order = await prisma.order.findFirst({
            where: {
                id: orderNumber,
                ...(userRole !== 'ADMIN' && { userId })
            },
            include: {
                user: { select: { id: true, name: true, email: true } },
                items: {
                    include: {
                        product: {
                            select: {
                                id: true,
                                name: true,
                                slug: true,
                                description: true,
                                price: true,
                                gallery: true,
                                stock: true,
                                isActive: true
                            }
                        }
                    }
                },
                payment: true,
            },
        });

        if (!order) throw new NotFoundError('Order not found');
        if (userRole !== 'ADMIN' && order.userId !== userId) {
            throw new ForbiddenError('You can only view your own orders');
        }

        const transformedOrder = {
            ...order,
            shippingAddress: order.shippingAddress || {},
            items: order.items.map(item => ({
                ...item,
                product: {
                    ...item.product,
                    image: item.product.gallery?.[0] || null
                }
            }))
        };

        return transformedOrder;
    }


    async getCustomerInfoFromOrder(orderId, userId, userRole) {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            select: {
                id: true,
                userId: true,
                shippingAddress: true,
                phone: true,
                user: {
                    select: {
                        name: true,
                        email: true,
                        phone: true
                    }
                }
            }
        });

        if (!order) throw new NotFoundError('Order not found');
        if (userRole !== 'ADMIN' && order.userId !== userId) {
            throw new ForbiddenError('You can only view your own orders');
        }

        const shippingAddress = order.shippingAddress || {};

        return {
            orderId: order.id,
            customer: {
                name: shippingAddress.name || order.user.name,
                email: shippingAddress.email || order.user.email,
                phone: shippingAddress.phone || order.phone || order.user.phone
            },
            shippingAddress: shippingAddress,
            phone: order.phone
        };
    }
}

export const orderService = new OrderService();
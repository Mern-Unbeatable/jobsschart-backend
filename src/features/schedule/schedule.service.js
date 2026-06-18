// src/features/schedule/schedule.service.js (Updated - removed availability methods)
import { prisma } from '../../config/db.js';
import { Logger } from '../../config/logger.js';
import { availabilityService } from '../availability/availability.service.js';

const log = new Logger('ScheduleService');

class ScheduleService {
    constructor() {
        this.log = new Logger('ScheduleService');
    }

    async createBooking(userId, data) {
        const { consultantId, bookingDate, startTime, endTime } = data;

        const startDateTime = new Date(`${bookingDate}T${startTime}:00`);
        const endDateTime = new Date(`${bookingDate}T${endTime}:00`);

        if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
            throw new Error('Invalid date/time format');
        }

        const consultant = await prisma.consultant.findUnique({
            where: { id: consultantId },
            include: { user: true }
        });

        if (!consultant) throw new Error('Consultant not found');
        if (!consultant.isApproved) throw new Error('Consultant is not approved');

        // Use availability service to check if time slot is available
        const isAvailable = await availabilityService.isTimeSlotAvailable(
            consultantId,
            startDateTime,
            (endDateTime - startDateTime) / (1000 * 60)
        );

        if (!isAvailable) throw new Error('Time slot is not available');

        const wallet = await prisma.wallet.findUnique({
            where: { userId },
        });

        if (!wallet) throw new Error('Wallet not found');

        const durationMinutes = (endDateTime - startDateTime) / (1000 * 60);
        let totalCost = Number(consultant.pricePerMinute) * durationMinutes;

        if (consultant.firstNMinutes && durationMinutes <= consultant.firstNMinutes) {
            totalCost = consultant.firstNPrice ? Number(consultant.firstNPrice) : totalCost;
        }

        const result = await prisma.$transaction(async (tx) => {
            const schedule = await tx.schedule.create({
                data: {
                    userId,
                    consultantId,
                    bookingDate: new Date(bookingDate),
                    startTime: startDateTime,
                    endTime: endDateTime,
                    status: 'PENDING',
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            username: true,
                            avatar: true,
                            email: true,
                            phone: true,
                        },
                    },
                    consultant: {
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    name: true,
                                    username: true,
                                    avatar: true,
                                    bio: true,
                                },
                            },
                        },
                    },
                },
            });

            return schedule;
        });

        return result;
    }

    async getMyBookings(userId, queryParams = {}) {
        const page = parseInt(queryParams.page) || 1;
        const limit = Math.min(parseInt(queryParams.limit) || 20, 100);
        const skip = (page - 1) * limit;

        const where = { userId };

        if (queryParams.status) {
            where.status = queryParams.status;
        }

        const [bookings, total] = await Promise.all([
            prisma.schedule.findMany({
                where,
                include: {
                    consultant: {
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    name: true,
                                    username: true,
                                    avatar: true,
                                    bio: true,
                                    location: true,
                                    phone: true,
                                },
                            },
                        },
                    },
                },
                orderBy: { bookingDate: 'desc' },
                skip,
                take: limit,
            }),
            prisma.schedule.count({ where }),
        ]);

        return {
            meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
            bookings,
        };
    }

    async getConsultantBookings(consultantUserId, queryParams = {}) {
        const consultant = await prisma.consultant.findUnique({
            where: { userId: consultantUserId },
        });

        if (!consultant) throw new Error('Consultant not found');

        const page = parseInt(queryParams.page) || 1;
        const limit = Math.min(parseInt(queryParams.limit) || 20, 100);
        const skip = (page - 1) * limit;

        const where = { consultantId: consultant.id };

        if (queryParams.status) {
            where.status = queryParams.status;
        }

        const [bookings, total] = await Promise.all([
            prisma.schedule.findMany({
                where,
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            username: true,
                            avatar: true,
                            email: true,
                            phone: true,
                        },
                    },
                },
                orderBy: { bookingDate: 'asc' },
                skip,
                take: limit,
            }),
            prisma.schedule.count({ where }),
        ]);

        return {
            meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
            bookings,
        };
    }

    async updateBookingStatus(bookingId, userId, role, status) {
        const booking = await prisma.schedule.findUnique({
            where: { id: bookingId },
            include: {
                consultant: true,
            },
        });

        if (!booking) throw new Error('Booking not found');

        const isOwner = booking.userId === userId;
        const isConsultant = booking.consultant.userId === userId;

        if (role !== 'ADMIN' && !isOwner && !isConsultant) {
            throw new Error('Unauthorized to update this booking');
        }

        if (status === 'CONFIRMED') {
            const isAvailable = await availabilityService.isTimeSlotAvailable(
                booking.consultantId,
                booking.startTime,
                (booking.endTime - booking.startTime) / (1000 * 60)
            );

            if (!isAvailable) throw new Error('Time slot is no longer available');
        }

        if (status === 'COMPLETED') {
            return await prisma.$transaction(async (tx) => {
                const updatedBooking = await tx.schedule.update({
                    where: { id: bookingId },
                    data: { status },
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                username: true,
                                avatar: true,
                                email: true,
                                phone: true,
                            },
                        },
                        consultant: {
                            include: {
                                user: {
                                    select: {
                                        id: true,
                                        name: true,
                                        username: true,
                                        avatar: true,
                                    },
                                },
                            },
                        },
                    },
                });

                await tx.call.create({
                    data: {
                        userId: booking.userId,
                        consultantId: booking.consultant.userId,
                        status: 'COMPLETED',
                        startTime: booking.startTime,
                        endTime: booking.endTime,
                        durationSeconds: Math.floor((booking.endTime - booking.startTime) / 1000),
                    },
                });

                return updatedBooking;
            });
        }

        return prisma.schedule.update({
            where: { id: bookingId },
            data: { status },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        username: true,
                        avatar: true,
                        email: true,
                        phone: true,
                    },
                },
                consultant: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                username: true,
                                avatar: true,
                            },
                        },
                    },
                },
            },
        });
    }

    async cancelBooking(bookingId, userId, role) {
        const booking = await prisma.schedule.findUnique({
            where: { id: bookingId },
            include: { consultant: true },
        });

        if (!booking) throw new Error('Booking not found');

        const isOwner = booking.userId === userId;
        const isConsultant = booking.consultant.userId === userId;

        if (role !== 'ADMIN' && !isOwner && !isConsultant) {
            throw new Error('Unauthorized to cancel this booking');
        }

        const now = new Date();
        const isBeforeStart = now < booking.startTime;
        let refundAmount = 0;

        if (isOwner && isBeforeStart && booking.status !== 'CANCELLED') {
            const durationMinutes = (booking.endTime - booking.startTime) / (1000 * 60);
            refundAmount = booking.consultant.pricePerMinute * durationMinutes;
        }

        return await prisma.$transaction(async (tx) => {
            const updatedBooking = await tx.schedule.update({
                where: { id: bookingId },
                data: { status: 'CANCELLED' },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            username: true,
                            avatar: true,
                            email: true,
                            phone: true,
                        },
                    },
                    consultant: {
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    name: true,
                                    username: true,
                                    avatar: true,
                                },
                            },
                        },
                    },
                },
            });

            if (refundAmount > 0) {
                const wallet = await tx.wallet.findUnique({
                    where: { userId },
                });

                const balanceBefore = wallet.creditBalance;
                const balanceAfter = balanceBefore + refundAmount;

                await tx.wallet.update({
                    where: { userId },
                    data: { creditBalance: balanceAfter },
                });

                await tx.creditTransaction.create({
                    data: {
                        userId,
                        transactionType: 'REFUND',
                        amount: refundAmount,
                        balanceBefore,
                        balanceAfter,
                        description: `Refund for cancelled booking ${bookingId}`,
                    },
                });
            }

            return updatedBooking;
        });
    }

    async getConsultantByUserId(userId) {
        return prisma.consultant.findUnique({
            where: { userId },
        });
    }

    async getConsultantById(consultantId) {
        return prisma.consultant.findUnique({
            where: { id: consultantId },
            include: { user: true },
        });
    }

    async getUpcomingBookings(consultantUserId, limit = 10) {
        const consultant = await prisma.consultant.findUnique({
            where: { userId: consultantUserId },
        });

        if (!consultant) throw new Error('Consultant not found');

        return prisma.schedule.findMany({
            where: {
                consultantId: consultant.id,
                startTime: { gte: new Date() },
                status: { in: ['PENDING', 'CONFIRMED'] },
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        username: true,
                        avatar: true,
                        email: true,
                        phone: true,
                    },
                },
            },
            orderBy: { startTime: 'asc' },
            take: limit,
        });
    }
}

export const scheduleService = new ScheduleService();
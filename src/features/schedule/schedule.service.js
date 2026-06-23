// src/features/schedule/schedule.service.js (Updated - removed availability methods)
import { prisma } from '../../config/db.js';
import { Logger } from '../../config/logger.js';

const log = new Logger('ScheduleService');

class ScheduleService {
    constructor() {
        this.log = new Logger('ScheduleService');
    }

    getTimeInMinutes(time) {
        const [hours, minutes] = time.split(':').map(Number);
        return (hours * 60) + minutes;
    }

    async isTimeSlotAvailable(consultantId, startDateTime, durationMinutes, excludeBookingId = null) {
        const requestedStart = new Date(startDateTime);
        const requestedEnd = new Date(requestedStart.getTime() + (durationMinutes * 60 * 1000));

        if (Number.isNaN(requestedStart.getTime()) || Number.isNaN(requestedEnd.getTime()) || durationMinutes <= 0) {
            return false;
        }

        const dayOfWeek = requestedStart.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
        const requestedStartMinutes = (requestedStart.getHours() * 60) + requestedStart.getMinutes();
        const requestedEndMinutes = (requestedEnd.getHours() * 60) + requestedEnd.getMinutes();

        const slots = await prisma.availabilitySlot.findMany({
            where: {
                consultantId,
                dayOfWeek,
                isActive: true,
            },
        });

        const isWithinAnySlot = slots.some((slot) => {
            const slotStartMinutes = this.getTimeInMinutes(slot.startTime);
            const slotEndMinutes = this.getTimeInMinutes(slot.endTime);
            return requestedStartMinutes >= slotStartMinutes && requestedEndMinutes <= slotEndMinutes;
        });

        if (!isWithinAnySlot) {
            return false;
        }

        const overlappingBooking = await prisma.schedule.findFirst({
            where: {
                consultantId,
                status: { in: ['PENDING', 'CONFIRMED'] },
                ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
                startTime: { lt: requestedEnd },
                endTime: { gt: requestedStart },
            },
        });

        return !overlappingBooking;
    }

    buildSessionAccess(booking) {
        const now = new Date();
        const sessionOpensAt = new Date(booking.startTime.getTime() - (10 * 60 * 1000));
        const canStartSession =
            ['PENDING', 'CONFIRMED'].includes(booking.status) &&
            now >= sessionOpensAt &&
            now <= booking.endTime;

        return {
            canStartCall: canStartSession,
            canStartChat: canStartSession,
            sessionOpensAt,
            sessionClosesAt: booking.endTime,
        };
    }

    async getBookingById(bookingId) {
        return prisma.schedule.findUnique({
            where: { id: bookingId },
            include: {
                consultant: true,
            },
        });
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
        const isAvailable = await this.isTimeSlotAvailable(
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
        const booking = await this.getBookingById(bookingId);

        if (!booking) throw new Error('Booking not found');

        const isOwner = booking.userId === userId;
        const isConsultant = booking.consultant.userId === userId;
        const isAdmin = role === 'ADMIN';
        const isManager = isConsultant || isAdmin;

        if (status === 'CONFIRMED') {
            if (!isManager) {
                throw new Error('Only consultant or admin can confirm this booking');
            }

            if (booking.status !== 'PENDING') {
                throw new Error('Only pending bookings can be confirmed');
            }

            const isAvailable = await this.isTimeSlotAvailable(
                booking.consultantId,
                booking.startTime,
                (booking.endTime - booking.startTime) / (1000 * 60),
                bookingId
            );

            if (!isAvailable) throw new Error('Time slot is no longer available');

            return this._updateBookingStatus(bookingId, status);
        }

        if (status === 'COMPLETED') {
            if (!isManager) {
                throw new Error('Only consultant or admin can complete this booking');
            }

            if (booking.status !== 'CONFIRMED') {
                throw new Error('Only confirmed bookings can be completed');
            }

            return this._updateBookingStatus(bookingId, status);
        }

        if (status === 'CANCELLED') {
            if (!(isOwner || isManager)) {
                throw new Error('Unauthorized to cancel this booking');
            }

            if (booking.status === 'CANCELLED' || booking.status === 'COMPLETED') {
                throw new Error('Booking cannot be cancelled now');
            }

            return await this._updateBookingStatus(bookingId, status);
        }

        if (status === 'NO_SHOW') {
            if (!isManager) {
                throw new Error('Only consultant or admin can mark no show');
            }

            if (booking.status !== 'CONFIRMED') {
                throw new Error('Only confirmed bookings can be marked no show');
            }

            return await this._updateBookingStatus(bookingId, status);
        }

        if (!isAdmin) {
            throw new Error('Unauthorized to update this booking');
        }

        return this._updateBookingStatus(bookingId, status);
    }

    async _updateBookingStatus(bookingId, status) {
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

    async confirmBooking(bookingId, userId, role) {
        return this.updateBookingStatus(bookingId, userId, role, 'CONFIRMED');
    }

    async completeBooking(bookingId, userId, role) {
        return this.updateBookingStatus(bookingId, userId, role, 'COMPLETED');
    }

    async cancelBookingByConsultant(bookingId, userId, role) {
        return this.updateBookingStatus(bookingId, userId, role, 'CANCELLED');
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

        const bookings = await prisma.schedule.findMany({
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

        return bookings.map((booking) => ({
            ...booking,
            sessionAccess: this.buildSessionAccess(booking),
        }));
    }

    async getUserUpcomingBookings(userId, limit = 10) {
        const bookings = await prisma.schedule.findMany({
            where: {
                userId,
                startTime: { gte: new Date() },
                status: { in: ['PENDING', 'CONFIRMED'] },
            },
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
                                email: true,
                                phone: true,
                            },
                        },
                    },
                },
            },
            orderBy: { startTime: 'asc' },
            take: limit,
        });

        return bookings.map((booking) => ({
            ...booking,
            consultantUserId: booking.consultant?.userId || null,
            sessionAccess: this.buildSessionAccess(booking),
        }));
    }
}

export const scheduleService = new ScheduleService();
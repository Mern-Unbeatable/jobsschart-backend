// src/features/schedule/schedule.service.js (Updated - removed availability methods)
import { prisma } from '../../config/db.js';
import { Logger } from '../../config/logger.js';
import nodemailer from 'nodemailer';
import { notifyBookingCancelled, notifyBookingConfirmed, notifyBookingCompleted, notifyNewBookingRequest } from '../../socket/index.js';

const log = new Logger('ScheduleService');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

class ScheduleService {
    constructor() {
        this.log = new Logger('ScheduleService');
    }

    getTimeInMinutes(time) {
        const [hours, minutes] = time.split(':').map(Number);
        return (hours * 60) + minutes;
    }

    _formatBookingDateLabel(startTime) {
        return new Date(startTime).toLocaleString('en-US', {
            dateStyle: 'full',
            timeStyle: 'short',
        });
    }

    /**
     * Flat reservation fee for schedule bookings (not per-minute for the full slot window).
     */
    getScheduleBookingFee(consultant) {
        if (consultant?.firstNPrice != null) {
            return Number(consultant.firstNPrice);
        }
        return Number(consultant?.pricePerMinute || 2.5);
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

        // Get day of week for the booking date
        const dayOfWeek = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][startDateTime.getDay()];

        // Check if the day is within consultant's availability
        const consultantSlots = await prisma.availabilitySlot.findMany({
            where: {
                consultantId,
                dayOfWeek,
                isActive: true,
            },
        });

        if (consultantSlots.length === 0) {
            throw new Error(`No availability slots found for ${dayOfWeek}. Consultant is only available on weekdays.`);
        }

        const consultant = await prisma.consultant.findUnique({
            where: { id: consultantId },
            include: { user: true }
        });

        if (!consultant) throw new Error('Consultant not found');
        if (!consultant.isApproved) throw new Error('Consultant is not approved');

        // Check if the requested time falls within any availability slot
        let isWithinSlot = false;
        const requestedStart = startDateTime.getHours() * 60 + startDateTime.getMinutes();
        const requestedEnd = endDateTime.getHours() * 60 + endDateTime.getMinutes();

        for (const slot of consultantSlots) {
            const slotStart = parseInt(slot.startTime.split(':')[0]) * 60 + parseInt(slot.startTime.split(':')[1]);
            const slotEnd = parseInt(slot.endTime.split(':')[0]) * 60 + parseInt(slot.endTime.split(':')[1]);

            if (requestedStart >= slotStart && requestedEnd <= slotEnd) {
                isWithinSlot = true;
                break;
            }
        }

        if (!isWithinSlot) {
            throw new Error(`Requested time (${startTime} - ${endTime}) does not fall within any available slot for ${dayOfWeek}`);
        }

        // Use availability service to check if time slot is available (not already booked)
        const isAvailable = await this.isTimeSlotAvailable(
            consultantId,
            startDateTime,
            (endDateTime - startDateTime) / (1000 * 60)
        );

        if (!isAvailable) throw new Error('Time slot is not available or already booked');

        const wallet = await prisma.wallet.findUnique({
            where: { userId },
        });

        if (!wallet) throw new Error('Wallet not found');

        const totalCost = Number(this.getScheduleBookingFee(consultant).toFixed(2));

        if (Number(wallet.creditBalance) < totalCost) {
            throw new Error(
                `Insufficient balance. Required: €${totalCost.toFixed(2)}, Available: €${Number(wallet.creditBalance).toFixed(2)}`
            );
        }

        const result = await prisma.$transaction(async (tx) => {
            const balanceBefore = Number(wallet.creditBalance);
            const balanceAfter = Number((balanceBefore - totalCost).toFixed(2));

            await tx.wallet.update({
                where: { userId },
                data: { creditBalance: balanceAfter },
            });

            await tx.creditTransaction.create({
                data: {
                    userId,
                    transactionType: 'ADJUSTMENT',
                    amount: -totalCost,
                    balanceBefore,
                    balanceAfter,
                    description: `Booking with ${consultant.user?.name || 'consultant'} on ${bookingDate} ${startTime}-${endTime}`,
                },
            });

            const schedule = await tx.schedule.create({
                data: {
                    userId,
                    consultantId,
                    bookingDate: startDateTime,
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

        const bookingDateLabel = this._formatBookingDateLabel(result.startTime);
        const clientName = result.user?.name || result.user?.username || 'A client';
        const consultantUserId = result.consultant?.userId;

        if (consultantUserId) {
            await prisma.notification.create({
                data: {
                    userId: consultantUserId,
                    type: 'SYSTEM',
                    title: 'New Appointment Request',
                    message: `${clientName} requested an appointment on ${bookingDateLabel}. Please review and confirm.`,
                    data: {
                        bookingId: result.id,
                        consultantId: result.consultantId,
                        status: 'PENDING',
                    },
                },
            }).catch((err) => log.error(`New booking notification failed: ${err.message}`));

            notifyNewBookingRequest(consultantUserId, {
                bookingId: result.id,
                title: 'New Appointment Request',
                message: `${clientName} requested an appointment on ${bookingDateLabel}.`,
                clientName,
                bookingDateLabel,
                status: 'PENDING',
            });

            if (result.consultant?.user?.email) {
                transporter.sendMail({
                    from: `"Illorac" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
                    to: result.consultant.user.email,
                    subject: 'New appointment request',
                    html: `<p>Hello ${result.consultant.user.name || 'there'},</p>
                           <p><strong>${clientName}</strong> has requested an appointment on <strong>${bookingDateLabel}</strong>.</p>
                           <p>Please log in to your consultant dashboard to accept or manage this booking.</p>
                           <p>Thank you,<br/>Illorac Team</p>`,
                }).catch((err) => log.error(`New booking consultant email failed: ${err.message}`));
            }
        }

        if (result.user?.email) {
            transporter.sendMail({
                from: `"Illorac" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
                to: result.user.email,
                subject: 'Appointment request received',
                html: `<p>Hello ${result.user.name || 'there'},</p>
                       <p>Your appointment request with <strong>${result.consultant?.user?.name || 'your consultant'}</strong> on <strong>${bookingDateLabel}</strong> has been received.</p>
                       <p>We will notify you once the consultant confirms your booking.</p>
                       <p>Thank you,<br/>Illorac Team</p>`,
            }).catch((err) => log.error(`New booking user email failed: ${err.message}`));
        }

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
        const updated = await this.updateBookingStatus(bookingId, userId, role, 'CONFIRMED');
        const bookingDateLabel = this._formatBookingDateLabel(updated.startTime);
        const consultantName = updated.consultant?.user?.name || 'your consultant';
        const message = `Your appointment with ${consultantName} on ${bookingDateLabel} has been confirmed.`;

        await prisma.notification.create({
            data: {
                userId: updated.userId,
                type: 'SYSTEM',
                title: 'Appointment Confirmed',
                message,
                data: {
                    bookingId: updated.id,
                    consultantId: updated.consultantId,
                    status: 'CONFIRMED',
                },
            },
        }).catch((err) => log.error(`Booking confirm notification failed: ${err.message}`));

        if (updated.user?.email) {
            transporter.sendMail({
                from: `"Illorac" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
                to: updated.user.email,
                subject: 'Your appointment has been confirmed',
                html: `<p>Hello ${updated.user.name || 'there'},</p>
                       <p>Great news! Your appointment with <strong>${consultantName}</strong> on <strong>${bookingDateLabel}</strong> has been confirmed.</p>
                       <p>You can view the details from your dashboard and contact your consultant via chat or call when needed.</p>
                       <p>Thank you,<br/>Illorac Team</p>`,
            }).catch((err) => log.error(`Booking confirm email failed: ${err.message}`));
        }

        notifyBookingConfirmed(updated.userId, {
            bookingId: updated.id,
            title: 'Appointment Confirmed',
            message,
            consultantName,
            bookingDateLabel,
            status: 'CONFIRMED',
        });

        return updated;
    }

    async completeBooking(bookingId, userId, role) {
        const updated = await this.updateBookingStatus(bookingId, userId, role, 'COMPLETED');
        const bookingDateLabel = this._formatBookingDateLabel(updated.startTime);
        const consultantName = updated.consultant?.user?.name || 'your consultant';
        const message = `Your appointment with ${consultantName} on ${bookingDateLabel} has been marked as completed.`;

        await prisma.notification.create({
            data: {
                userId: updated.userId,
                type: 'SYSTEM',
                title: 'Appointment Completed',
                message,
                data: {
                    bookingId: updated.id,
                    consultantId: updated.consultantId,
                    status: 'COMPLETED',
                },
            },
        }).catch((err) => log.error(`Booking complete notification failed: ${err.message}`));

        if (updated.user?.email) {
            transporter.sendMail({
                from: `"Illorac" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
                to: updated.user.email,
                subject: 'Your appointment is complete',
                html: `<p>Hello ${updated.user.name || 'there'},</p>
                       <p>Your appointment with <strong>${consultantName}</strong> on <strong>${bookingDateLabel}</strong> has been marked as completed.</p>
                       <p>Thank you for using Illorac. We hope your session was helpful.</p>
                       <p>Thank you,<br/>Illorac Team</p>`,
            }).catch((err) => log.error(`Booking complete email failed: ${err.message}`));
        }

        notifyBookingCompleted(updated.userId, {
            bookingId: updated.id,
            title: 'Appointment Completed',
            message,
            consultantName,
            bookingDateLabel,
            status: 'COMPLETED',
        });

        return updated;
    }

    async cancelBookingByConsultant(bookingId, userId, role) {
        const booking = await prisma.schedule.findUnique({
            where: { id: bookingId },
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

        if (!booking) throw new Error('Booking not found');

        const isConsultant = booking.consultant.userId === userId;
        const isAdmin = role === 'ADMIN';

        if (!isConsultant && !isAdmin) {
            throw new Error('Only the consultant can cancel this booking');
        }

        if (booking.status === 'CANCELLED' || booking.status === 'COMPLETED') {
            throw new Error('Booking cannot be cancelled now');
        }

        const now = new Date();
        const isBeforeStart = now < new Date(booking.startTime);
        let refundAmount = 0;

        if (isBeforeStart) {
            refundAmount = this.getScheduleBookingFee(booking.consultant);
        }

        const bookingDateLabel = new Date(booking.startTime).toLocaleString('en-US', {
            dateStyle: 'full',
            timeStyle: 'short',
        });
        const consultantName = booking.consultant?.user?.name || 'your consultant';

        const updatedBooking = await prisma.$transaction(async (tx) => {
            const updated = await tx.schedule.update({
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
                    where: { userId: booking.userId },
                });

                if (wallet) {
                    const balanceBefore = Number(wallet.creditBalance);
                    const balanceAfter = balanceBefore + refundAmount;

                    await tx.wallet.update({
                        where: { userId: booking.userId },
                        data: { creditBalance: balanceAfter },
                    });

                    await tx.creditTransaction.create({
                        data: {
                            userId: booking.userId,
                            transactionType: 'REFUND',
                            amount: refundAmount,
                            balanceBefore,
                            balanceAfter,
                            description: `Refund for appointment cancelled by consultant (${bookingId})`,
                        },
                    });
                }
            }

            await tx.notification.create({
                data: {
                    userId: booking.userId,
                    type: 'SYSTEM',
                    title: 'Appointment Cancelled',
                    message: `Your appointment with ${consultantName} on ${bookingDateLabel} was cancelled by the consultant.`,
                    data: {
                        bookingId: booking.id,
                        consultantId: booking.consultantId,
                        cancelledBy: 'consultant',
                        refundAmount,
                    },
                },
            });

            return updated;
        });

        if (updatedBooking.user?.email) {
            transporter.sendMail({
                from: `"Illorac" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
                to: updatedBooking.user.email,
                subject: 'Your appointment has been cancelled',
                html: `<p>Hello ${updatedBooking.user.name || 'there'},</p>
                       <p>We regret to inform you that your appointment with <strong>${consultantName}</strong> scheduled for <strong>${bookingDateLabel}</strong> has been cancelled by the consultant.</p>
                       ${refundAmount > 0 ? `<p>A refund of <strong>€${Number(refundAmount).toFixed(2)}</strong> has been credited to your wallet.</p>` : ''}
                       <p>You can book a new appointment at any time from your dashboard.</p>
                       <p>Thank you,<br/>Illorac Team</p>`,
            }).catch((err) => log.error(`Consultant cancel notification email failed: ${err.message}`));
        }

        notifyBookingCancelled(booking.userId, {
            bookingId: booking.id,
            title: 'Appointment Cancelled',
            message: `Your appointment with ${consultantName} on ${bookingDateLabel} was cancelled by the consultant.${
                refundAmount > 0 ? ` A refund of €${Number(refundAmount).toFixed(2)} has been credited to your wallet.` : ''
            }`,
            refundAmount,
            cancelledBy: 'consultant',
        });

        return updatedBooking;
    }

    async cancelBooking(bookingId, userId, role) {
        const booking = await prisma.schedule.findUnique({
            where: { id: bookingId },
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
                                email: true,
                            },
                        },
                    },
                },
            },
        });

        if (!booking) throw new Error('Booking not found');

        const isOwner = booking.userId === userId;
        const isConsultant = booking.consultant.userId === userId;

        if (role !== 'ADMIN' && !isOwner && !isConsultant) {
            throw new Error('Unauthorized to cancel this booking');
        }

        if (booking.status === 'CANCELLED' || booking.status === 'COMPLETED') {
            throw new Error('Booking cannot be cancelled now');
        }

        const now = new Date();
        const isBeforeStart = now < new Date(booking.startTime);
        let refundAmount = 0;

        if (isOwner && isBeforeStart) {
            refundAmount = this.getScheduleBookingFee(booking.consultant);
        }

        const bookingDateLabel = new Date(booking.startTime).toLocaleString('en-US', {
            dateStyle: 'full',
            timeStyle: 'short',
        });
        const clientName = booking.user?.name || booking.user?.username || 'Client';
        const consultantName = booking.consultant?.user?.name || 'Consultant';
        const consultantUserId = booking.consultant.userId;

        const updatedBooking = await prisma.$transaction(async (tx) => {
            const updated = await tx.schedule.update({
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
                                    email: true,
                                },
                            },
                        },
                    },
                },
            });

            if (refundAmount > 0) {
                const wallet = await tx.wallet.findUnique({
                    where: { userId: booking.userId },
                });

                if (wallet) {
                    const balanceBefore = Number(wallet.creditBalance);
                    const balanceAfter = balanceBefore + refundAmount;

                    await tx.wallet.update({
                        where: { userId: booking.userId },
                        data: { creditBalance: balanceAfter },
                    });

                    await tx.creditTransaction.create({
                        data: {
                            userId: booking.userId,
                            transactionType: 'REFUND',
                            amount: refundAmount,
                            balanceBefore,
                            balanceAfter,
                            description: `Refund for cancelled booking ${bookingId}`,
                        },
                    });
                }
            }

            if (isOwner) {
                await tx.notification.create({
                    data: {
                        userId: consultantUserId,
                        type: 'SYSTEM',
                        title: 'Appointment Cancelled',
                        message: `${clientName} cancelled their appointment scheduled for ${bookingDateLabel}.`,
                        data: {
                            bookingId: booking.id,
                            consultantId: booking.consultantId,
                            cancelledBy: 'user',
                        },
                    },
                });
            }

            return updated;
        });

        if (isOwner && updatedBooking.user?.email) {
            transporter.sendMail({
                from: `"Illorac" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
                to: updatedBooking.user.email,
                subject: 'Your appointment has been cancelled',
                html: `<p>Hello ${updatedBooking.user.name || 'there'},</p>
                       <p>Your appointment with <strong>${consultantName}</strong> scheduled for <strong>${bookingDateLabel}</strong> has been cancelled.</p>
                       ${refundAmount > 0 ? `<p>A refund of <strong>€${Number(refundAmount).toFixed(2)}</strong> has been credited to your wallet.</p>` : ''}
                       <p>Thank you,<br/>Illorac Team</p>`,
            }).catch((err) => log.error(`User cancel confirmation email failed: ${err.message}`));
        }

        if (isOwner && updatedBooking.consultant?.user?.email) {
            transporter.sendMail({
                from: `"Illorac" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
                to: updatedBooking.consultant.user.email,
                subject: 'Appointment cancelled by client',
                html: `<p>Hello ${consultantName},</p>
                       <p><strong>${clientName}</strong> has cancelled their appointment scheduled for <strong>${bookingDateLabel}</strong>.</p>
                       <p>You can view your updated schedule from your consultant dashboard.</p>
                       <p>Thank you,<br/>Illorac Team</p>`,
            }).catch((err) => log.error(`Consultant cancel notification email failed: ${err.message}`));
        }

        if (isOwner) {
            notifyBookingCancelled(consultantUserId, {
                bookingId: booking.id,
                title: 'Appointment Cancelled',
                message: `${clientName} cancelled their appointment on ${bookingDateLabel}.`,
                cancelledBy: 'user',
            });
        }

        return updatedBooking;
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
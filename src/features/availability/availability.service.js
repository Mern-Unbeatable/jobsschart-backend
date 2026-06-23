// src/features/availability/availability.service.js
import { prisma } from '../../config/db.js';
import { Logger } from '../../config/logger.js';

const log = new Logger('AvailabilityService');

class AvailabilityService {
    // ==================== HELPER METHODS ====================

    getDayLabel(dayOfWeek) {
        const labels = {
            'SUNDAY': 'Sunday',
            'MONDAY': 'Monday',
            'TUESDAY': 'Tuesday',
            'WEDNESDAY': 'Wednesday',
            'THURSDAY': 'Thursday',
            'FRIDAY': 'Friday',
            'SATURDAY': 'Saturday'
        };
        return labels[dayOfWeek] || dayOfWeek;
    }

    getDayOrder(dayOfWeek) {
        const order = {
            'SUNDAY': 0,
            'MONDAY': 1,
            'TUESDAY': 2,
            'WEDNESDAY': 3,
            'THURSDAY': 4,
            'FRIDAY': 5,
            'SATURDAY': 6
        };
        return order[dayOfWeek];
    }

    async getConsultantByUserId(userId) {
        return prisma.consultant.findUnique({
            where: { userId },
        });
    }

    async getConsultantById(consultantId) {
        return prisma.consultant.findUnique({
            where: { id: consultantId },
        });
    }

    getTimeInMinutes(time) {
        const [hours, minutes] = time.split(':').map(Number);
        return (hours * 60) + minutes;
    }

    /**
     * Check whether a requested datetime range fits a consultant weekly slot
     * and has no overlap with existing active bookings.
     */
    async isTimeSlotAvailable(consultantId, startDateTime, durationMinutes, excludeBookingId = null) {
        const requestedStart = new Date(startDateTime);
        const requestedEnd = new Date(requestedStart.getTime() + (durationMinutes * 60 * 1000));

        if (Number.isNaN(requestedStart.getTime()) || Number.isNaN(requestedEnd.getTime()) || durationMinutes <= 0) {
            return false;
        }

        const consultant = await this.getConsultantById(consultantId);
        if (!consultant) return false;

        const dayOfWeek = requestedStart.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
        const requestedStartMinutes = (requestedStart.getHours() * 60) + requestedStart.getMinutes();
        const requestedEndMinutes = (requestedEnd.getHours() * 60) + requestedEnd.getMinutes();

        const slots = await prisma.availabilitySlot.findMany({
            where: {
                consultantId: consultant.id,
                dayOfWeek,
                isActive: true,
            },
        });

        const isWithinAnySlot = slots.some((slot) => {
            const slotStartMinutes = this.getTimeInMinutes(slot.startTime);
            const slotEndMinutes = this.getTimeInMinutes(slot.endTime);
            return requestedStartMinutes >= slotStartMinutes && requestedEndMinutes <= slotEndMinutes;
        });

        if (!isWithinAnySlot) return false;

        const overlappingBooking = await prisma.schedule.findFirst({
            where: {
                consultantId: consultant.id,
                status: { in: ['PENDING', 'CONFIRMED'] },
                ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
                startTime: { lt: requestedEnd },
                endTime: { gt: requestedStart },
            },
        });

        return !overlappingBooking;
    }

    // ==================== SLOT CRUD OPERATIONS ====================

    async createWeeklySlots(consultantId, slots) {
        const createdSlots = [];

        for (const slot of slots) {
            const existingSlot = await prisma.availabilitySlot.findFirst({
                where: {
                    consultantId,
                    dayOfWeek: slot.dayOfWeek,
                    startTime: slot.startTime,
                    endTime: slot.endTime,
                    isActive: true,
                },
            });

            if (!existingSlot) {
                const newSlot = await prisma.availabilitySlot.create({
                    data: {
                        consultantId,
                        dayOfWeek: slot.dayOfWeek,
                        startTime: slot.startTime,
                        endTime: slot.endTime,
                        isActive: true,
                    },
                });
                createdSlots.push({
                    ...newSlot,
                    type: 'weekly',
                    dayLabel: this.getDayLabel(newSlot.dayOfWeek),
                });
            }
        }

        return createdSlots;
    }

    async bulkCreateSlots(consultantUserId, slotsData) {
        const consultant = await this.getConsultantByUserId(consultantUserId);

        if (!consultant) throw new Error('Consultant not found');

        const createdSlots = [];
        const errors = [];

        for (const slot of slotsData.slots) {
            try {
                if (slot.dayOfWeek) {
                    // Weekly recurring slot only
                    const result = await this.createWeeklySlots(consultant.id, [slot]);
                    createdSlots.push(...result);
                } else {
                    errors.push({ slot, error: 'Invalid slot format. dayOfWeek is required' });
                }
            } catch (error) {
                errors.push({ slot, error: error.message });
            }
        }

        return {
            success: createdSlots.length,
            failed: errors.length,
            createdSlots,
            errors,
        };
    }

    async getAvailabilitySlots(consultantId, options = {}) {
        let consultant;

        const consultantById = await this.getConsultantById(consultantId);
        if (consultantById) {
            consultant = consultantById;
        } else {
            consultant = await this.getConsultantByUserId(consultantId);
        }

        if (!consultant) throw new Error('Consultant not found');

        const where = {
            consultantId: consultant.id,
            isActive: true
        };

        const slots = await prisma.availabilitySlot.findMany({
            where,
            orderBy: [
                { dayOfWeek: 'asc' },
                { startTime: 'asc' }
            ],
        });

        const weeklySlots = slots.map(slot => ({
            id: slot.id,
            type: 'weekly',
            dayOfWeek: slot.dayOfWeek,
            dayLabel: this.getDayLabel(slot.dayOfWeek),
            dayOrder: this.getDayOrder(slot.dayOfWeek),
            startTime: slot.startTime,
            endTime: slot.endTime,
            isActive: slot.isActive,
        }));

        // If specific date is requested, filter slots for that date
        if (options.date) {
            const targetDate = new Date(options.date);
            const dayOfWeek = targetDate.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();

            const availableSlotsForDate = weeklySlots.filter(
                slot => slot.dayOfWeek === dayOfWeek && slot.isActive
            );

            return {
                date: options.date,
                dayOfWeek,
                availableSlots: availableSlotsForDate,
                weeklySlots,
            };
        }

        return {
            weeklySlots,
            allSlots: slots,
        };
    }

    async updateAvailabilitySlot(slotId, consultantUserId, data) {
        const consultant = await this.getConsultantByUserId(consultantUserId);

        if (!consultant) throw new Error('Consultant not found');

        const slot = await prisma.availabilitySlot.findFirst({
            where: { id: slotId, consultantId: consultant.id },
        });

        if (!slot) throw new Error('Availability slot not found');

        const updateData = {};

        if (data.dayOfWeek !== undefined) updateData.dayOfWeek = data.dayOfWeek;
        if (data.startTime !== undefined) updateData.startTime = data.startTime;
        if (data.endTime !== undefined) updateData.endTime = data.endTime;
        if (data.isActive !== undefined) updateData.isActive = data.isActive;

        const updatedSlot = await prisma.availabilitySlot.update({
            where: { id: slotId },
            data: updateData,
        });

        return {
            ...updatedSlot,
            type: 'weekly',
            dayLabel: this.getDayLabel(updatedSlot.dayOfWeek),
        };
    }

    async deleteAvailabilitySlot(slotId, consultantUserId) {
        const consultant = await this.getConsultantByUserId(consultantUserId);

        if (!consultant) throw new Error('Consultant not found');

        const slot = await prisma.availabilitySlot.findFirst({
            where: { id: slotId, consultantId: consultant.id },
        });

        if (!slot) throw new Error('Availability slot not found');

        await prisma.availabilitySlot.delete({
            where: { id: slotId },
        });

        return { success: true, message: 'Availability slot deleted successfully' };
    }


}

export const availabilityService = new AvailabilityService();
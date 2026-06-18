import { z } from 'zod';
const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
const dateRegex = /^\d{2}-\d{2}-\d{4}$/;

export const createBookingSchema = z
    .object({
        consultantId: z.string().uuid('Invalid consultant ID'),
        bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid booking date format (YYYY-MM-DD)'),
        startTime: z.string().regex(timeRegex, 'Invalid start time format (HH:mm)'),
        endTime: z.string().regex(timeRegex, 'Invalid end time format (HH:mm)'),
    })
    .transform((data) => {
        return {
            ...data,
            startDateTime: new Date(`${data.bookingDate}T${data.startTime}:00`),
            endDateTime: new Date(`${data.bookingDate}T${data.endTime}:00`),
        };
    })
    .refine((data) => data.startDateTime < data.endDateTime, {
        message: 'Start time must be before end time',
        path: ['startTime'],
    })
    .refine((data) => data.startDateTime > new Date(), {
        message: 'Booking time must be in the future',
        path: ['startTime'],
    });

export const updateBookingStatusSchema = z.object({
    status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'], {
        required_error: 'Status is required',
    }),
});
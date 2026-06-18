import { z } from 'zod';

export const DayOfWeekEnum = z.enum([
    'SUNDAY',
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY'
]);

export const DayOfWeekLabels = {
    SUNDAY: 'Sunday',
    MONDAY: 'Monday',
    TUESDAY: 'Tuesday',
    WEDNESDAY: 'Wednesday',
    THURSDAY: 'Thursday',
    FRIDAY: 'Friday',
    SATURDAY: 'Saturday',
};

export const DayOfWeekOptions = [
    { value: 'MONDAY', label: 'Monday' },
    { value: 'TUESDAY', label: 'Tuesday' },
    { value: 'WEDNESDAY', label: 'Wednesday' },
    { value: 'THURSDAY', label: 'Thursday' },
    { value: 'FRIDAY', label: 'Friday' },
    { value: 'SATURDAY', label: 'Saturday' },
    { value: 'SUNDAY', label: 'Sunday' },
];

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
const dateRegex = /^\d{2}-\d{2}-\d{4}$/;

// Single weekly slot schema
export const weeklySlotSchema = z.object({
    dayOfWeek: DayOfWeekEnum,
    startTime: z.string().regex(timeRegex, 'Invalid time format (HH:mm)'),
    endTime: z.string().regex(timeRegex, 'Invalid time format (HH:mm)'),
}).refine((data) => data.startTime < data.endTime, {
    message: 'Start time must be before end time',
    path: ['startTime'],
});

// Single date-specific slot schema
export const dateSlotSchema = z.object({
    date: z.string().regex(dateRegex, 'Invalid date format (DD-MM-YYYY)'),
    dayOfWeek: DayOfWeekEnum,
    startTime: z.string().regex(timeRegex, 'Invalid time format (HH:mm)'),
    endTime: z.string().regex(timeRegex, 'Invalid time format (HH:mm)'),
}).refine((data) => data.startTime < data.endTime, {
    message: 'Start time must be before end time',
    path: ['startTime'],
});

// Bulk create slots schema
export const bulkCreateSlotsSchema = z.object({
    slots: z.array(z.union([weeklySlotSchema, dateSlotSchema])),
});

// Update availability slot schema
export const updateAvailabilitySlotSchema = z.object({
    dayOfWeek: DayOfWeekEnum.optional(),
    startTime: z.string().regex(timeRegex, 'Invalid time format (HH:mm)').optional(),
    endTime: z.string().regex(timeRegex, 'Invalid time format (HH:mm)').optional(),
    isActive: z.boolean().optional(),
    specificDate: z.string().regex(dateRegex, 'Invalid date format (DD-MM-YYYY)').optional().nullable(),
}).refine((data) => {
    if (data.startTime && data.endTime) {
        return data.startTime < data.endTime;
    }
    return true;
}, {
    message: 'Start time must be before end time',
    path: ['startTime'],
});

// Get availability query schema
export const getAvailabilityQuerySchema = z.object({
    includeDateSpecific: z.coerce.boolean().default(true),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').optional(),
});
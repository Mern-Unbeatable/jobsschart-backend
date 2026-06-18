import { z } from 'zod';

export const updateConsultantProfileSchema = z.object({
    specialization: z.array(z.string()).optional(),
    bio: z.string().max(1000, 'Bio must be less than 1000 characters').optional().nullable(),
    pricePerMinute: z.number().positive('Price per minute must be positive').optional(),
    firstNMinutes: z.number().int().positive('First N minutes must be positive').optional().nullable(),
    firstNPrice: z.number().positive('First N price must be positive').optional().nullable(),
});
export const updateOnlineStatusSchema = z.object({
    onlineStatus: z.enum(['ONLINE', 'OFFLINE', 'BUSY'], {
        required_error: 'Online status is required',
        invalid_type_error: 'Online status must be ONLINE, OFFLINE, or BUSY',
    }),
});

export const approveConsultantSchema = z.object({
    isApproved: z.boolean({
        required_error: 'isApproved is required',
        invalid_type_error: 'isApproved must be a boolean',
    }),
});




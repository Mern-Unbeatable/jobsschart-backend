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

const ibanRegex = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/i;
const bsnRegex = /^[0-9]{9}$/;
const kvkRegex = /^[0-9]{8}$/;

export const updateVerificationInfoSchema = z.object({
    bsnNumber: z.string().regex(bsnRegex, 'BSN must be exactly 9 digits'),
    kvkNumber: z.string().regex(kvkRegex, 'KvK number must be exactly 8 digits'),
    cityOfResidence: z.string().min(2, 'City is required').max(100),
    businessBankAccount: z
        .string()
        .min(15, 'IBAN is required')
        .max(34)
        .refine((v) => ibanRegex.test(v.replace(/\s/g, '')), 'Invalid IBAN format'),
    idFrontUrl: z.string().url('ID front image is required').optional(),
    idBackUrl: z.string().url('ID back image is required').optional(),
}).refine((data) => data.idFrontUrl && data.idBackUrl, {
    message: 'Both ID front and ID back images are required',
    path: ['idFrontUrl'],
});

export const reviewVerificationSchema = z.object({
    status: z.enum(['VERIFIED', 'REJECTED']),
    rejectReason: z.string().min(10).max(500).optional(),
}).refine((data) => data.status !== 'REJECTED' || !!data.rejectReason, {
    message: 'Reject reason is required when rejecting verification',
    path: ['rejectReason'],
});

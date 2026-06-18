import { z } from 'zod';

export const createDonationSchema = z.object({
    donorType: z.enum(['INDIVIDUAL', 'BUSINESS']),
    name: z.string().min(2, 'Name must be at least 2 characters').max(100),
    phone: z.string().min(5, 'Phone number is required').max(20),
    email: z.string().email('Valid email is required'),
    amount: z.number().int().positive('Amount must be a positive integer'),
    description: z.string().max(500).optional(),
    location: z.string().max(200).optional(),
    businessName: z.string().max(200).optional(),
    websiteUrl: z.string().max(500).optional(),
    businessType: z.enum(['LOCAL_BUSINESS', 'ONLINE_BUSINESS']).optional().default('LOCAL_BUSINESS'),
    image: z.string().url('Invalid image URL').optional(),
    benefit: z.string().min(3, 'Benefit description is required').max(500),
});

export const updateDonationSchema = createDonationSchema.partial();
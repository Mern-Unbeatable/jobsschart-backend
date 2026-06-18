import { z } from 'zod';

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(50).optional().nullable(),
  bio: z.string().max(500).optional().nullable(),
  location: z.string().max(100).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  avatar: z.string().url('Invalid avatar URL').optional().nullable(),
  language: z.string().max(10).optional().nullable(),
});

export const adjustCreditsSchema = z.object({
  amount: z.number().int().refine((val) => val !== 0, {
    message: 'Amount must be non-zero',
  }),
  type: z.enum(['PURCHASE', 'CALL_DEDUCTION', 'REFUND', 'BONUS', 'ADJUSTMENT']),
  description: z.string().optional(),
});

export const setVerifiedSchema = z.object({
  isVerified: z.boolean({ required_error: 'isVerified (boolean) is required' }),
});

export const updateUserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'BANNED', 'PENDING'], {
    required_error: 'status is required',
  }),
});

export const updateUserRoleSchema = z.object({
  role: z.enum(['USER', 'CONSULTANT', 'ADMIN'], {
    required_error: 'role is required',
  }),
});

export const assignPackageSchema = z.object({
  packageId: z.string().uuid('Invalid package ID'),
});

export const addCreditsSchema = z.object({
  amount: z.number().positive().int(),
  reference: z.string().optional(),
});
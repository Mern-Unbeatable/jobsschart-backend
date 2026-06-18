import { z } from 'zod';

const optionalStringArray = z.preprocess(
  (val) => {
    if (val === null || val === undefined || val === "") return undefined;

    // If already array, clean it
    if (Array.isArray(val)) {
      const cleaned = val.filter(item => item && item.trim().length > 0);
      return cleaned.length > 0 ? cleaned : undefined;
    }

    // If string, try to parse JSON or split by comma
    if (typeof val === 'string') {
      // Check if it's a JSON string
      if (val.startsWith('[')) {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) {
            const cleaned = parsed.filter(item => item && item.trim().length > 0);
            return cleaned.length > 0 ? cleaned : undefined;
          }
        } catch (e) {
          // Not valid JSON, fall through to comma split
        }
      }

      // Split by comma
      const cleaned = val
        .split(',')
        .map(item => item.trim())
        .filter(item => item.length > 0);
      return cleaned.length > 0 ? cleaned : undefined;
    }

    return undefined;
  },
  z.array(z.string()).optional()
);

export const signupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(50).optional(),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
  role: z.enum(['USER', 'CONSULTANT', 'ADMIN']).default('USER').optional(),
  category: z.string().optional().nullable(),
  topics: z.string().optional().nullable(),
  phone: z.string(),
  bio: z.string().max(500, 'Bio must be less than 500 characters').optional(),
  location: z.string().optional(),
  language: z.string().default('nl').optional(),
  avatar: z.string().url('Invalid avatar URL').optional(),
  specialization: optionalStringArray,
  pricePerMinute: z.number().positive().optional(),
  firstNMinutes: z.number().positive().optional(),
  firstNPrice: z.number().positive().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

export const signinSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email format'),
});

export const resetPasswordSchema = z.object({
  email: z.string().email('Invalid email format'),
  otp: z.string().length(6, 'OTP must be 6 digits'),
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
});
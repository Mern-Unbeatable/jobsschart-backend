
import { z } from 'zod';
import { validateZod } from '../../shared/globals/helpers/zodValidate.js';

// ── Consultant: submit payout request with bank details inline ────
export const validatePayoutRequest = validateZod(
    z.object({
        amount: z
            .number({
                required_error:    'Amount is required',
                invalid_type_error: 'Amount must be a number',
            })
            .positive('Amount must be positive')
            .min(10,    'Minimum payout amount is €10')
            .max(10000, 'Maximum payout amount is €10,000 per request')
            .multipleOf(0.01),

        organisationName: z
            .string({
                required_error: 'Business / organisation name is required',
            })
            .min(2,   'Name must be at least 2 characters')
            .max(150, 'Name cannot exceed 150 characters')
            .trim(),

        routingNumber: z
            .string({
                required_error: 'Routing number is required',
            })
            .min(3,  'Routing number must be at least 3 characters')
            .max(50, 'Routing number cannot exceed 50 characters')
            .trim(),

        accountNumber: z
            .string({
                required_error: 'Account number is required',
            })
            .min(3,  'Account number must be at least 3 characters')
            .max(50, 'Account number cannot exceed 50 characters')
            .trim(),
    })
);

// ── Admin: approve ────────────────────────────────────────────────
export const validateApprove = validateZod(
    z.object({
        adminNote: z.string().max(500).optional(),
    })
);

// ── Admin: reject ─────────────────────────────────────────────────
export const validateReject = validateZod(
    z.object({
        rejectReason: z
            .string()
            .min(10, 'Please provide a detailed reason (min 10 characters)')
            .max(500),
    })
);
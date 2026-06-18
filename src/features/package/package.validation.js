// src/features/package/package.validation.js
import { z } from 'zod';

export const createPackageSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers and hyphens only'),
  price: z.number().positive('Price must be positive'),
  minutes: z.number().int().min(0, 'Minutes must be 0 or positive').optional(),
  credits: z.number().int().positive('Credits must be a positive integer').optional(),
  description: z.string().min(10, 'Description must be at least 10 characters').max(500).optional(),
  features: z.array(z.string().min(1)).max(20).optional().default([]),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().min(0).optional().default(0),
});

export const updatePackageSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  price: z.number().positive().optional(),
  minutes: z.number().int().min(0).optional(),
  credits: z.number().int().positive().optional(),
  description: z.string().min(10).max(500).optional(),
  features: z.array(z.string().min(1)).max(20).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const getPackagesQuerySchema = z.object({
  page: z.string().optional().transform(val => parseInt(val) || 1),
  limit: z.string().optional().transform(val => Math.min(parseInt(val) || 20, 100)),
  isActive: z.enum(['true', 'false']).optional(),
  search: z.string().optional(),
  sortBy: z.enum(['name', 'price', 'minutes', 'credits', 'sortOrder', 'createdAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});
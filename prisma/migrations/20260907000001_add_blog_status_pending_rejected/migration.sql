-- Add PENDING_APPROVAL and REJECTED to BlogStatus enum
-- These values exist in schema.prisma but were missing from the initial migration
ALTER TYPE "BlogStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
ALTER TYPE "BlogStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

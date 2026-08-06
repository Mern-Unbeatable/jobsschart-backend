-- Baseline migration: these changes already exist in the database.
-- This file syncs migration history with the actual DB state (no data loss).

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

-- AlterEnum
ALTER TYPE "ChatSessionStatus" ADD VALUE 'PENDING';

-- AlterTable
ALTER TABLE "consultants" ADD COLUMN "bioNl" TEXT;
ALTER TABLE "consultants" ADD COLUMN "idFrontUrl" TEXT;
ALTER TABLE "consultants" ADD COLUMN "idBackUrl" TEXT;
ALTER TABLE "consultants" ADD COLUMN "bsnNumber" TEXT;
ALTER TABLE "consultants" ADD COLUMN "kvkNumber" TEXT;
ALTER TABLE "consultants" ADD COLUMN "cityOfResidence" TEXT;
ALTER TABLE "consultants" ADD COLUMN "businessBankAccount" TEXT;
ALTER TABLE "consultants" ADD COLUMN "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED';

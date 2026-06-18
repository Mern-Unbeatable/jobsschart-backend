/*
  Warnings:

  - You are about to drop the column `payoutDate` on the `payouts` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "PayoutMethod" AS ENUM ('STRIPE', 'BANK');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PayoutStatus" ADD VALUE 'APPROVED';
ALTER TYPE "PayoutStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "payouts" DROP COLUMN "payoutDate",
ADD COLUMN     "adminNote" TEXT,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "method" "PayoutMethod" NOT NULL DEFAULT 'STRIPE',
ADD COLUMN     "netAmount" DECIMAL(10,2),
ADD COLUMN     "platformFee" DECIMAL(10,2),
ADD COLUMN     "processedAt" TIMESTAMP(3),
ADD COLUMN     "rejectReason" TEXT,
ADD COLUMN     "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedBy" TEXT,
ADD COLUMN     "stripeAccountId" TEXT,
ADD COLUMN     "stripeTransferId" TEXT;

-- CreateTable
CREATE TABLE "consultant_bank_details" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "stripeAccountId" TEXT,
    "stripeAccountStatus" TEXT,
    "bankName" TEXT,
    "accountHolder" TEXT,
    "iban" TEXT,
    "bic" TEXT,
    "bankCountry" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultant_bank_details_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "consultant_bank_details_consultantId_key" ON "consultant_bank_details"("consultantId");

-- CreateIndex
CREATE INDEX "payouts_consultantId_idx" ON "payouts"("consultantId");

-- CreateIndex
CREATE INDEX "payouts_status_idx" ON "payouts"("status");

-- AddForeignKey
ALTER TABLE "consultant_bank_details" ADD CONSTRAINT "consultant_bank_details_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "consultants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

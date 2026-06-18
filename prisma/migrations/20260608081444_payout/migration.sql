/*
  Warnings:

  - The values [STRIPE] on the enum `PayoutMethod` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `stripeAccountId` on the `payouts` table. All the data in the column will be lost.
  - You are about to drop the column `stripePayoutId` on the `payouts` table. All the data in the column will be lost.
  - You are about to drop the column `stripeTransferId` on the `payouts` table. All the data in the column will be lost.
  - You are about to drop the `consultant_bank_details` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "PayoutMethod_new" AS ENUM ('BANK');
ALTER TABLE "payouts" ALTER COLUMN "method" DROP DEFAULT;
ALTER TABLE "payouts" ALTER COLUMN "method" TYPE "PayoutMethod_new" USING ("method"::text::"PayoutMethod_new");
ALTER TYPE "PayoutMethod" RENAME TO "PayoutMethod_old";
ALTER TYPE "PayoutMethod_new" RENAME TO "PayoutMethod";
DROP TYPE "PayoutMethod_old";
ALTER TABLE "payouts" ALTER COLUMN "method" SET DEFAULT 'BANK';
COMMIT;

-- DropForeignKey
ALTER TABLE "consultant_bank_details" DROP CONSTRAINT "consultant_bank_details_consultantId_fkey";

-- AlterTable
ALTER TABLE "payouts" DROP COLUMN "stripeAccountId",
DROP COLUMN "stripePayoutId",
DROP COLUMN "stripeTransferId",
ADD COLUMN     "accountNumber" TEXT,
ADD COLUMN     "organisationName" TEXT,
ADD COLUMN     "routingNumber" TEXT,
ALTER COLUMN "method" SET DEFAULT 'BANK';

-- DropTable
DROP TABLE "consultant_bank_details";

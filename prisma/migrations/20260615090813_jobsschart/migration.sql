/*
  Warnings:

  - You are about to drop the column `productCategoryId` on the `products` table. All the data in the column will be lost.
  - Added the required column `productCategory` to the `products` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "products" DROP CONSTRAINT "products_productCategoryId_fkey";

-- AlterTable
ALTER TABLE "products" DROP COLUMN "productCategoryId",
ADD COLUMN     "productCategory" TEXT NOT NULL;

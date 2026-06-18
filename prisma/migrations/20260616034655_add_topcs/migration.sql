/*
  Warnings:

  - You are about to drop the column `category` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `topics` on the `users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "users" DROP COLUMN "category",
DROP COLUMN "topics";

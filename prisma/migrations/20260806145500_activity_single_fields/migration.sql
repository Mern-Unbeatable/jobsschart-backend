-- Rename English columns to single-field names
ALTER TABLE "activities" RENAME COLUMN "titleEn" TO "title";
ALTER TABLE "activities" RENAME COLUMN "descriptionEn" TO "description";
ALTER TABLE "activities" RENAME COLUMN "hostTitleEn" TO "hostTitle";
ALTER TABLE "activities" RENAME COLUMN "locationEn" TO "location";
ALTER TABLE "activities" RENAME COLUMN "durationEn" TO "duration";

-- Drop Dutch / duplicate columns
ALTER TABLE "activities" DROP COLUMN "titleNl";
ALTER TABLE "activities" DROP COLUMN "descriptionNl";
ALTER TABLE "activities" DROP COLUMN "hostTitleNl";
ALTER TABLE "activities" DROP COLUMN "priceNl";
ALTER TABLE "activities" DROP COLUMN "locationNl";
ALTER TABLE "activities" DROP COLUMN "durationNl";

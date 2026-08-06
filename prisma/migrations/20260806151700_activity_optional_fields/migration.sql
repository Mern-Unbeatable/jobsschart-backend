-- Make optional activity fields nullable
ALTER TABLE "activities" ALTER COLUMN "hostTitle" DROP NOT NULL;
ALTER TABLE "activities" ALTER COLUMN "price" DROP NOT NULL;
ALTER TABLE "activities" ALTER COLUMN "location" DROP NOT NULL;
ALTER TABLE "activities" ALTER COLUMN "duration" DROP NOT NULL;
ALTER TABLE "activities" ALTER COLUMN "image" DROP NOT NULL;

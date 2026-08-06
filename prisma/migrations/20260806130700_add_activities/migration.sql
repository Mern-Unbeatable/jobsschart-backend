-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('EVENT', 'WORKSHOP');

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleNl" TEXT NOT NULL,
    "descriptionEn" TEXT NOT NULL,
    "descriptionNl" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "hostTitleEn" TEXT NOT NULL,
    "hostTitleNl" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "price" TEXT NOT NULL,
    "priceNl" TEXT NOT NULL,
    "locationEn" TEXT NOT NULL,
    "locationNl" TEXT NOT NULL,
    "durationEn" TEXT NOT NULL,
    "durationNl" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "image" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_registrations" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activities_type_idx" ON "activities"("type");

-- CreateIndex
CREATE INDEX "activities_date_idx" ON "activities"("date");

-- CreateIndex
CREATE INDEX "activity_registrations_activityId_idx" ON "activity_registrations"("activityId");

-- CreateIndex
CREATE INDEX "activity_registrations_emailAddress_idx" ON "activity_registrations"("emailAddress");

-- AddForeignKey
ALTER TABLE "activity_registrations" ADD CONSTRAINT "activity_registrations_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

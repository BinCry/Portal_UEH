ALTER TABLE "StudentProfile"
ADD COLUMN "locationLatitude" DOUBLE PRECISION,
ADD COLUMN "locationLongitude" DOUBLE PRECISION,
ADD COLUMN "locationAccuracyMeters" DOUBLE PRECISION,
ADD COLUMN "locationUpdatedAt" TIMESTAMP(3);

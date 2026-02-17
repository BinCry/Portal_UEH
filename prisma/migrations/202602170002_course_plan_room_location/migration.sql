-- CreateEnum
CREATE TYPE "CoursePlanType" AS ENUM ('IN_PLAN', 'OUT_PLAN');

-- AlterTable
ALTER TABLE "Course"
ADD COLUMN "planType" "CoursePlanType" NOT NULL DEFAULT 'IN_PLAN';

-- AlterTable
ALTER TABLE "Room"
ADD COLUMN "campus" TEXT,
ADD COLUMN "address" TEXT;

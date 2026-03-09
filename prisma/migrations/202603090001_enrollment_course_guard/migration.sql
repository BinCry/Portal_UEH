-- Add courseId to Enrollment and backfill from Section
ALTER TABLE "Enrollment"
ADD COLUMN "courseId" TEXT;

UPDATE "Enrollment" AS e
SET "courseId" = s."courseId"
FROM "Section" AS s
WHERE s."id" = e."sectionId";

ALTER TABLE "Enrollment"
ALTER COLUMN "courseId" SET NOT NULL;

-- Add FK after backfill
ALTER TABLE "Enrollment"
ADD CONSTRAINT "Enrollment_courseId_fkey"
FOREIGN KEY ("courseId") REFERENCES "Course"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- Index for enrollment checks by student/course/state
CREATE INDEX "Enrollment_studentId_courseId_status_idx"
ON "Enrollment"("studentId", "courseId", "status");

-- Enforce one active enrollment per student/course
CREATE UNIQUE INDEX "Enrollment_studentId_courseId_enrolled_key"
ON "Enrollment"("studentId", "courseId")
WHERE "status" = 'ENROLLED';

-- Enforce one active waiting entry per student/waiting room
CREATE UNIQUE INDEX "WaitingEntry_waitingRoomId_studentId_active_key"
ON "WaitingEntry"("waitingRoomId", "studentId")
WHERE "state" IN ('QUEUED', 'PENDING_ADMIN', 'OFFERED');

-- Section counter hardening
ALTER TABLE "Section"
ADD CONSTRAINT "Section_registeredCount_non_negative_chk"
CHECK ("registeredCount" >= 0);

ALTER TABLE "Section"
ADD CONSTRAINT "Section_reservedCount_non_negative_chk"
CHECK ("reservedCount" >= 0);

ALTER TABLE "Section"
ADD CONSTRAINT "Section_capacity_not_less_than_counters_chk"
CHECK ("capacity" >= ("registeredCount" + "reservedCount"));

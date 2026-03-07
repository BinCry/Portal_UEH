ALTER TABLE "Section" DROP CONSTRAINT IF EXISTS "Section_instructorId_fkey";
ALTER TABLE "Section" DROP COLUMN IF EXISTS "instructorId";
DROP TABLE IF EXISTS "Instructor";

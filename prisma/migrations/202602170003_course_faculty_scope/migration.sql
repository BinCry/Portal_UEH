-- AlterTable
ALTER TABLE "Course"
ADD COLUMN "faculty" TEXT NOT NULL DEFAULT 'Chưa phân ngành';

-- CreateIndex
CREATE INDEX "Course_faculty_planType_isActive_idx" ON "Course"("faculty", "planType", "isActive");

import { PageTransition } from "@/components/shared/page-transition";
import { CoursesCatalog } from "@/components/student/courses-catalog";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function StudentCoursesPage() {
  const session = await requireRole("STUDENT");
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.user.id },
    select: { faculty: true },
  });

  const studentFaculty = profile?.faculty?.trim();
  if (!studentFaculty) {
    return (
      <PageTransition>
        <CoursesCatalog courses={[]} studentFaculty={null} />
      </PageTransition>
    );
  }

  const courses = await prisma.course.findMany({
    where: {
      isActive: true,
      faculty: studentFaculty,
    },
    include: {
      _count: {
        select: { sections: true },
      },
      waitingRoom: true,
    },
    orderBy: [{ planType: "asc" }, { code: "asc" }],
  });

  return (
    <PageTransition>
      <CoursesCatalog courses={courses} studentFaculty={studentFaculty} />
    </PageTransition>
  );
}

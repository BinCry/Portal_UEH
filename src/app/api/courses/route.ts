import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api";
import { requireApiRole } from "@/lib/route-guards";

export async function GET() {
  const auth = await requireApiRole("STUDENT");
  if (!auth.ok) {
    return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);
  }

  const profile = await prisma.studentProfile.findUnique({
    where: { userId: auth.user.id },
    select: { faculty: true },
  });
  const studentFaculty = profile?.faculty?.trim();

  if (!studentFaculty) {
    return ok([]);
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
      waitingRoom: {
        select: {
          id: true,
          isActive: true,
          buffer: true,
        },
      },
    },
    orderBy: [{ planType: "asc" }, { code: "asc" }],
  });

  return ok(courses);
}

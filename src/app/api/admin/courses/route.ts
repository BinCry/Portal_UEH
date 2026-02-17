import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/route-guards";
import { courseSchema } from "@/lib/zod-schemas/admin";

export async function GET() {
  const auth = await requireApiRole("ADMIN");
  if (!auth.ok) {
    return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);
  }

  const courses = await prisma.course.findMany({
    include: {
      _count: { select: { sections: true } },
      waitingRoom: true,
    },
    orderBy: [{ faculty: "asc" }, { planType: "asc" }, { code: "asc" }],
  });
  return ok(courses);
}

export async function POST(request: Request) {
  const auth = await requireApiRole("ADMIN");
  if (!auth.ok) {
    return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);
  }

  try {
    const body = await parseBody(request, courseSchema);
    const course = await prisma.course.create({ data: body });
    return ok(course, { status: 201 });
  } catch (error) {
    return fail(
      {
        code: "CREATE_COURSE_FAILED",
        message: "Không thể tạo học phần",
        details: error,
      },
      400,
    );
  }
}

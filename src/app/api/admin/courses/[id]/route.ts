import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/route-guards";
import { courseSchema } from "@/lib/zod-schemas/admin";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, context: Context) {
  const auth = await requireApiRole("ADMIN");
  if (!auth.ok) {
    return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);
  }
  const { id } = await context.params;

  const course = await prisma.course.findUnique({
    where: { id },
    include: { waitingRoom: true, sections: true },
  });
  if (!course) return fail({ code: "NOT_FOUND", message: "Không tìm thấy học phần" }, 404);
  return ok(course);
}

export async function PATCH(request: Request, context: Context) {
  const auth = await requireApiRole("ADMIN");
  if (!auth.ok) {
    return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);
  }
  const { id } = await context.params;

  try {
    const body = await parseBody(request, courseSchema.partial());
    const updated = await prisma.course.update({
      where: { id },
      data: body,
    });
    return ok(updated);
  } catch (error) {
    return fail(
      {
        code: "UPDATE_COURSE_FAILED",
        message: "Không thể cập nhật học phần",
        details: error,
      },
      400,
    );
  }
}

export async function DELETE(_: Request, context: Context) {
  const auth = await requireApiRole("ADMIN");
  if (!auth.ok) {
    return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);
  }
  const { id } = await context.params;
  await prisma.course.delete({ where: { id } });
  return ok({ deleted: true });
}

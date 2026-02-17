import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/route-guards";
import { instructorSchema } from "@/lib/zod-schemas/admin";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, context: Context) {
  const auth = await requireApiRole("ADMIN");
  if (!auth.ok) return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);
  const { id } = await context.params;
  const data = await prisma.instructor.findUnique({ where: { id } });
  if (!data) return fail({ code: "NOT_FOUND", message: "Không tìm thấy giảng viên" }, 404);
  return ok(data);
}

export async function PATCH(request: Request, context: Context) {
  const auth = await requireApiRole("ADMIN");
  if (!auth.ok) return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);
  try {
    const body = await parseBody(request, instructorSchema.partial());
    const { id } = await context.params;
    const data = await prisma.instructor.update({
      where: { id },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.email !== undefined ? { email: body.email || null } : {}),
      },
    });
    return ok(data);
  } catch (error) {
    return fail(
      {
        code: "UPDATE_INSTRUCTOR_FAILED",
        message: "Không thể cập nhật giảng viên",
        details: error,
      },
      400,
    );
  }
}

export async function DELETE(_: Request, context: Context) {
  const auth = await requireApiRole("ADMIN");
  if (!auth.ok) return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);
  const { id } = await context.params;
  await prisma.instructor.delete({ where: { id } });
  return ok({ deleted: true });
}

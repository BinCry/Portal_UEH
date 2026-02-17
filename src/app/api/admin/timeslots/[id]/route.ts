import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/route-guards";
import { timeslotSchema } from "@/lib/zod-schemas/admin";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, context: Context) {
  const auth = await requireApiRole("ADMIN");
  if (!auth.ok) return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);
  const { id } = await context.params;
  const data = await prisma.timeSlot.findUnique({ where: { id } });
  if (!data) return fail({ code: "NOT_FOUND", message: "Không tìm thấy khung giờ" }, 404);
  return ok(data);
}

export async function PATCH(request: Request, context: Context) {
  const auth = await requireApiRole("ADMIN");
  if (!auth.ok) return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);
  try {
    const body = await parseBody(request, timeslotSchema.partial());
    const { id } = await context.params;
    const data = await prisma.timeSlot.update({
      where: { id },
      data: body,
    });
    return ok(data);
  } catch (error) {
    return fail(
      {
        code: "UPDATE_TIMESLOT_FAILED",
        message: "Không thể cập nhật khung giờ",
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
  await prisma.timeSlot.delete({ where: { id } });
  return ok({ deleted: true });
}

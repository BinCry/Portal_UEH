import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/route-guards";
import { roomSchema } from "@/lib/zod-schemas/admin";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, context: Context) {
  const auth = await requireApiRole("ADMIN");
  if (!auth.ok) return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);
  const { id } = await context.params;
  const data = await prisma.room.findUnique({ where: { id } });
  if (!data) return fail({ code: "NOT_FOUND", message: "Không tìm thấy phòng" }, 404);
  return ok(data);
}

export async function PATCH(request: Request, context: Context) {
  const auth = await requireApiRole("ADMIN");
  if (!auth.ok) return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);
  try {
    const body = await parseBody(request, roomSchema.partial());
    const { id } = await context.params;
    const data = await prisma.room.update({
      where: { id },
      data: body,
    });
    return ok(data);
  } catch (error) {
    return fail(
      {
        code: "UPDATE_ROOM_FAILED",
        message: "Không thể cập nhật phòng",
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
  await prisma.room.delete({ where: { id } });
  return ok({ deleted: true });
}

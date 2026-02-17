import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/route-guards";
import { roomSchema } from "@/lib/zod-schemas/admin";

export async function GET() {
  const auth = await requireApiRole("ADMIN");
  if (!auth.ok) return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);
  const data = await prisma.room.findMany({
    orderBy: { code: "asc" },
  });
  return ok(data);
}

export async function POST(request: Request) {
  const auth = await requireApiRole("ADMIN");
  if (!auth.ok) return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);
  try {
    const body = await parseBody(request, roomSchema);
    const data = await prisma.room.create({
      data: body,
    });
    return ok(data, { status: 201 });
  } catch (error) {
    return fail(
      {
        code: "CREATE_ROOM_FAILED",
        message: "Không thể tạo phòng học",
        details: error,
      },
      400,
    );
  }
}


import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/route-guards";
import { timeslotSchema } from "@/lib/zod-schemas/admin";

export async function GET() {
  const auth = await requireApiRole("ADMIN");
  if (!auth.ok) return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);

  const data = await prisma.timeSlot.findMany({
    orderBy: { startTime: "asc" },
  });
  return ok(data);
}

export async function POST(request: Request) {
  const auth = await requireApiRole("ADMIN");
  if (!auth.ok) return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);

  try {
    const body = await parseBody(request, timeslotSchema);
    const data = await prisma.timeSlot.create({ data: body });
    return ok(data, { status: 201 });
  } catch (error) {
    return fail(
      {
        code: "CREATE_TIMESLOT_FAILED",
        message: "Không thể tạo khung giờ",
        details: error,
      },
      400,
    );
  }
}


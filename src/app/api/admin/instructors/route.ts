import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/route-guards";
import { instructorSchema } from "@/lib/zod-schemas/admin";

export async function GET() {
  const auth = await requireApiRole("ADMIN");
  if (!auth.ok) return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);

  const data = await prisma.instructor.findMany({
    orderBy: {
      name: "asc",
    },
  });
  return ok(data);
}

export async function POST(request: Request) {
  const auth = await requireApiRole("ADMIN");
  if (!auth.ok) return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);

  try {
    const body = await parseBody(request, instructorSchema);
    const data = await prisma.instructor.create({
      data: {
        name: body.name,
        email: body.email || null,
      },
    });
    return ok(data, { status: 201 });
  } catch (error) {
    return fail(
      {
        code: "CREATE_INSTRUCTOR_FAILED",
        message: "Không thể tạo giảng viên",
        details: error,
      },
      400,
    );
  }
}


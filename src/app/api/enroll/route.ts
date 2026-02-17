import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { requireApiRole } from "@/lib/route-guards";
import { enrollSchema } from "@/lib/zod-schemas/student";
import { enrollmentService } from "@/domain/services/enrollment.service";
import { prisma } from "@/lib/prisma";
import { waitingRoomService } from "@/domain/services/waiting-room.service";

export async function POST(request: Request) {
  const auth = await requireApiRole("STUDENT");
  if (!auth.ok) {
    return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);
  }

  try {
    const body = await parseBody(request, enrollSchema);
    const section = await prisma.section.findUnique({
      where: { id: body.sectionId },
      select: { courseId: true },
    });
    if (!section) {
      return fail({ code: "NOT_FOUND", message: "Không tìm thấy LHP" }, 404);
    }

    await waitingRoomService.evaluateAndActivate(section.courseId);
    const enrollment = await enrollmentService.directEnroll(auth.user.id, body.sectionId);
    return ok({ enrollment });
  } catch (error) {
    return fail(
      {
        code: "ENROLL_FAILED",
        message: error instanceof Error ? error.message : "Đăng ký thất bại",
      },
      409,
    );
  }
}


import { fail, ok } from "@/lib/api";
import { canUpdateCapacity, validateSeatCounters } from "@/domain/policies/capacity";
import { parseBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/route-guards";
import { updateCapacitySchema } from "@/lib/zod-schemas/admin";
import { EnrollmentStatus } from "@prisma/client";

type Context = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: Context) {
  const auth = await requireApiRole("ADMIN");
  if (!auth.ok) return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);

  try {
    const body = await parseBody(request, updateCapacitySchema);
    const { id } = await context.params;

    const section = await prisma.section.findUnique({
      where: { id },
      include: {
        course: {
          include: {
            waitingRoom: true,
          },
        },
      },
    });
    if (!section) {
      return fail({ code: "NOT_FOUND", message: "Không tìm thấy LHP" }, 404);
    }

    const waitingActive = Boolean(section.course.waitingRoom?.isActive);
    const canEdit = canUpdateCapacity({
      capacityHidden: section.capacityHidden,
      waitingRoomActive: waitingActive,
      userCanOverride: auth.user.canOverrideCapacity,
      overrideRequested: Boolean(body.override),
    });

    if (!canEdit) {
      return fail(
        {
          code: "CAPACITY_LOCKED",
          message: "Chỉ được cập nhật sĩ số khi phòng chờ đang active",
        },
        403,
      );
    }

    const enrolledCount = await prisma.enrollment.count({
      where: {
        sectionId: section.id,
        status: EnrollmentStatus.ENROLLED,
      },
    });
    const seatCounterError = validateSeatCounters({
      capacity: body.capacity,
      registeredCount: section.registeredCount,
      reservedCount: section.reservedCount,
      enrolledCount,
    });
    if (seatCounterError) {
      return fail({ code: "INVALID_CAPACITY_STATE", message: seatCounterError }, 400);
    }

    const updated = await prisma.section.update({
      where: { id: section.id },
      data: {
        capacity: body.capacity,
      },
    });
    return ok(updated);
  } catch (error) {
    return fail(
      {
        code: "UPDATE_CAPACITY_FAILED",
        message: "Không thể cập nhật sĩ số",
        details: error,
      },
      400,
    );
  }
}

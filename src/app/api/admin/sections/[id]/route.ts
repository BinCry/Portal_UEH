import { DayOfWeek } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/route-guards";
import { sectionSchema } from "@/lib/zod-schemas/admin";

type Context = {
  params: Promise<{ id: string }>;
};

const toDateOrNull = (value?: string) => (value ? new Date(value) : null);

export async function GET(_: Request, context: Context) {
  const auth = await requireApiRole("ADMIN");
  if (!auth.ok) return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);
  const { id } = await context.params;

  const section = await prisma.section.findUnique({
    where: { id },
    include: {
      course: {
        include: {
          waitingRoom: true,
        },
      },
      instructor: true,
      room: true,
      timeSlot: true,
    },
  });
  if (!section) return fail({ code: "NOT_FOUND", message: "Không tìm thấy LHP" }, 404);

  return ok(section);
}

export async function PATCH(request: Request, context: Context) {
  const auth = await requireApiRole("ADMIN");
  if (!auth.ok) return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);
  const { id } = await context.params;

  try {
    const body = await parseBody(request, sectionSchema.partial());
    let roomId = body.roomId;
    let instructorId = body.instructorId;

    if (!roomId && body.room) {
      const roomCode = body.room.code.trim().toUpperCase();
      const room = await prisma.room.upsert({
        where: { code: roomCode },
        update: {
          campus: body.room.campus?.trim() || undefined,
          address: body.room.address?.trim() || undefined,
          building: body.room.building?.trim() || body.room.campus?.trim() || "UEH",
          capacity: body.room.capacity ?? body.capacity ?? undefined,
        },
        create: {
          code: roomCode,
          campus: body.room.campus?.trim() || null,
          address: body.room.address?.trim() || null,
          building: body.room.building?.trim() || body.room.campus?.trim() || "UEH",
          capacity: body.room.capacity ?? body.capacity ?? 60,
        },
      });
      roomId = room.id;
    }

    if (!instructorId && body.instructorName) {
      const normalizedName = body.instructorName.trim();
      const existingInstructor = await prisma.instructor.findFirst({
        where: {
          name: { equals: normalizedName, mode: "insensitive" },
        },
      });

      if (existingInstructor) {
        instructorId = existingInstructor.id;
      } else {
        const createdInstructor = await prisma.instructor.create({
          data: {
            name: normalizedName,
          },
        });
        instructorId = createdInstructor.id;
      }
    }

    const section = await prisma.section.update({
      where: { id },
      data: {
        ...(body.code ? { code: body.code } : {}),
        ...(body.courseId ? { courseId: body.courseId } : {}),
        ...(instructorId ? { instructorId } : {}),
        ...(roomId ? { roomId } : {}),
        ...(body.dayOfWeek ? { dayOfWeek: body.dayOfWeek as DayOfWeek } : {}),
        ...(body.timeSlotId ? { timeSlotId: body.timeSlotId } : {}),
        ...(body.startDate !== undefined ? { startDate: toDateOrNull(body.startDate) } : {}),
        ...(body.endDate !== undefined ? { endDate: toDateOrNull(body.endDate) } : {}),
        ...(body.capacity !== undefined ? { capacity: body.capacity } : {}),
        ...(body.isWaitingOption !== undefined ? { isWaitingOption: body.isWaitingOption } : {}),
        ...(body.capacityHidden !== undefined ? { capacityHidden: body.capacityHidden } : {}),
        ...(body.registeredCount !== undefined ? { registeredCount: body.registeredCount } : {}),
        ...(body.status ? { status: body.status } : {}),
      },
    });
    return ok(section);
  } catch (error) {
    return fail(
      {
        code: "UPDATE_SECTION_FAILED",
        message: "Không thể cập nhật LHP",
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
  await prisma.section.delete({ where: { id } });
  return ok({ deleted: true });
}

import { DayOfWeek } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/route-guards";
import { sectionSchema } from "@/lib/zod-schemas/admin";

const toDateOrNull = (value?: string) => (value ? new Date(value) : null);

export async function GET() {
  const auth = await requireApiRole("ADMIN");
  if (!auth.ok) return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);

  const sections = await prisma.section.findMany({
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
    orderBy: { createdAt: "desc" },
  });

  return ok(
    sections.map((section) => ({
      ...section,
      canEditCapacity:
        !section.capacityHidden || Boolean(section.course.waitingRoom && section.course.waitingRoom.isActive),
    })),
  );
}

export async function POST(request: Request) {
  const auth = await requireApiRole("ADMIN");
  if (!auth.ok) return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);

  try {
    const body = await parseBody(request, sectionSchema);
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
          capacity: body.room.capacity ?? body.capacity,
        },
        create: {
          code: roomCode,
          campus: body.room.campus?.trim() || null,
          address: body.room.address?.trim() || null,
          building: body.room.building?.trim() || body.room.campus?.trim() || "UEH",
          capacity: body.room.capacity ?? body.capacity,
        },
      });
      roomId = room.id;
    }

    if (!roomId) {
      return fail({ code: "INVALID_ROOM", message: "Vui lòng chọn hoặc nhập phòng học hợp lệ" }, 400);
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

    if (!instructorId) {
      return fail({ code: "INVALID_INSTRUCTOR", message: "Vui lòng nhập tên giảng viên hợp lệ" }, 400);
    }

    const section = await prisma.section.create({
      data: {
        code: body.code,
        courseId: body.courseId,
        instructorId,
        roomId,
        dayOfWeek: body.dayOfWeek as DayOfWeek,
        timeSlotId: body.timeSlotId,
        startDate: toDateOrNull(body.startDate),
        endDate: toDateOrNull(body.endDate),
        capacity: body.capacity,
        isWaitingOption: body.isWaitingOption,
        capacityHidden: body.capacityHidden,
        registeredCount: body.registeredCount,
        status: body.status,
      },
    });
    return ok(section, { status: 201 });
  } catch (error) {
    return fail(
      {
        code: "CREATE_SECTION_FAILED",
        message: "Không thể tạo LHP",
        details: error,
      },
      400,
    );
  }
}


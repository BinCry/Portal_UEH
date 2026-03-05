import { DayOfWeek } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/route-guards";
import { sectionSchema } from "@/lib/zod-schemas/admin";

type Context = {
  params: Promise<{ id: string }>;
};

const toDateOrNull = (value: string | undefined, label: "Ngày bắt đầu" | "Ngày kết thúc") => {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const dmySlash = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  const dmyDash = /^(\d{2})-(\d{2})-(\d{4})$/.exec(raw);

  let year: number;
  let month: number;
  let day: number;

  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (dmySlash) {
    day = Number(dmySlash[1]);
    month = Number(dmySlash[2]);
    year = Number(dmySlash[3]);
  } else if (dmyDash) {
    day = Number(dmyDash[1]);
    month = Number(dmyDash[2]);
    year = Number(dmyDash[3]);
  } else {
    throw new Error(`${label} không đúng định dạng. Vui lòng nhập dạng dd/mm/yyyy hoặc yyyy-mm-dd`);
  }

  if (year < 1900 || year > 2100) {
    throw new Error(`${label} không hợp lệ (năm phải từ 1900 đến 2100)`);
  }

  const normalized = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const valid =
    normalized.getUTCFullYear() === year &&
    normalized.getUTCMonth() === month - 1 &&
    normalized.getUTCDate() === day;
  if (!valid) {
    throw new Error(`${label} không hợp lệ`);
  }

  // Keep date-only stable across timezones by storing at UTC noon.
  return normalized;
};

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
    const currentSection = await prisma.section.findUnique({
      where: { id },
      select: { startDate: true, endDate: true },
    });
    if (!currentSection) {
      return fail({ code: "NOT_FOUND", message: "Không tìm thấy LHP" }, 404);
    }

    const body = await parseBody(request, sectionSchema.partial());
    const nextStartDate =
      body.startDate !== undefined ? toDateOrNull(body.startDate, "Ngày bắt đầu") : currentSection.startDate;
    const nextEndDate =
      body.endDate !== undefined ? toDateOrNull(body.endDate, "Ngày kết thúc") : currentSection.endDate;
    if (nextStartDate && nextEndDate && nextStartDate.getTime() > nextEndDate.getTime()) {
      return fail(
        {
          code: "INVALID_DATE_RANGE",
          message: "Ngày bắt đầu không được lớn hơn ngày kết thúc",
        },
        400,
      );
    }

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
        ...(body.startDate !== undefined ? { startDate: nextStartDate } : {}),
        ...(body.endDate !== undefined ? { endDate: nextEndDate } : {}),
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
        message: error instanceof Error ? error.message : "Không thể cập nhật LHP",
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

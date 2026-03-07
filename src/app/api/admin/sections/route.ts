import { DayOfWeek } from "@prisma/client";
import { validateSeatCounters } from "@/domain/policies/capacity";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/route-guards";
import { sectionSchema } from "@/lib/zod-schemas/admin";

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
    const startDate = toDateOrNull(body.startDate, "Ngày bắt đầu");
    const endDate = toDateOrNull(body.endDate, "Ngày kết thúc");
    if (startDate && endDate && startDate.getTime() > endDate.getTime()) {
      return fail(
        {
          code: "INVALID_DATE_RANGE",
          message: "Ngày bắt đầu không được lớn hơn ngày kết thúc",
        },
        400,
      );
    }

    let roomId = body.roomId;

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

    const seatCounterError = validateSeatCounters({
      capacity: body.capacity,
      registeredCount: body.registeredCount,
      reservedCount: 0,
      enrolledCount: 0,
    });
    if (seatCounterError) {
      return fail({ code: "INVALID_CAPACITY_STATE", message: seatCounterError }, 400);
    }

    // Validate all required fields before calling Prisma to avoid opaque
    // "(not available)" error messages from the pg driver adapter.
    const requiredFields: Record<string, unknown> = {
      code: body.code,
      courseId: body.courseId,
      roomId,
      dayOfWeek: body.dayOfWeek,
      timeSlotId: body.timeSlotId,
      capacity: body.capacity,
    };
    for (const [field, value] of Object.entries(requiredFields)) {
      if (value === null || value === undefined || value === "") {
        return fail(
          { code: "MISSING_REQUIRED_FIELD", message: `Thiếu trường bắt buộc: ${field}` },
          400,
        );
      }
    }

    const createData = {
      code: body.code,
      courseId: body.courseId,
      roomId,
      dayOfWeek: body.dayOfWeek as DayOfWeek,
      timeSlotId: body.timeSlotId,
      startDate: startDate ?? undefined,
      endDate: endDate ?? undefined,
      capacity: body.capacity,
      isWaitingOption: body.isWaitingOption ?? false,
      capacityHidden: body.capacityHidden ?? false,
      registeredCount: body.registeredCount ?? 0,
      status: body.status ?? "OPEN",
    };
    console.log("[CREATE_SECTION] data:", JSON.stringify(createData, null, 2));

    const section = await prisma.section.create({ data: createData });
    return ok(section, { status: 201 });
  } catch (error) {
    console.error("[CREATE_SECTION]", error);
    return fail(
      {
        code: "CREATE_SECTION_FAILED",
        message: error instanceof Error ? error.message : "Không thể tạo LHP",
        details: error,
      },
      400,
    );
  }
}

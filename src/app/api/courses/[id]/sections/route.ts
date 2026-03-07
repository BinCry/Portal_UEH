import { computeStudentSectionStatus } from "@/domain/policies/schedule";
import { waitingRoomService } from "@/domain/services/waiting-room.service";
import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/route-guards";

type Context = {
  params: Promise<{ id: string }>;
};

const mapSectionForStudent = (
  section: {
    id: string;
    code: string;
    dayOfWeek: string;
    startDate: Date | null;
    endDate: Date | null;
    capacity: number;
    capacityHidden: boolean;
    registeredCount: number;
    reservedCount: number;
    isWaitingOption: boolean;
    room: { id: string; code: string; campus: string | null; address: string | null; building: string; capacity: number };
    timeSlot: { id: string; label: string; startTime: string; endTime: string };
  },
  buffer: number,
) => {
  const studentStatus = computeStudentSectionStatus(
    section.capacity,
    section.registeredCount,
    section.reservedCount,
    buffer,
  );
  const availableSlots = section.capacity - section.registeredCount - section.reservedCount;

  if (section.capacityHidden) {
    return {
      ...section,
      studentStatus,
      availableSlots,
      capacity: null,
      registeredCount: null,
      reservedCount: null,
    };
  }

  return {
    ...section,
    studentStatus,
    availableSlots,
  };
};

export async function GET(_: Request, context: Context) {
  const auth = await requireApiRole("STUDENT");
  if (!auth.ok) {
    return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);
  }

  const profile = await prisma.studentProfile.findUnique({
    where: { userId: auth.user.id },
    select: { faculty: true },
  });
  const studentFaculty = profile?.faculty?.trim();
  if (!studentFaculty) {
    return fail({ code: "FORBIDDEN", message: "Bạn chưa được gán ngành/chương trình đào tạo" }, 403);
  }

  const { id: courseId } = await context.params;
  const courseBase = await prisma.course.findFirst({
    where: { id: courseId, faculty: studentFaculty },
    select: {
      id: true,
      code: true,
      name: true,
      credits: true,
      faculty: true,
      planType: true,
    },
  });

  if (!courseBase) {
    return fail({ code: "NOT_FOUND", message: "Không tìm thấy học phần phù hợp ngành của bạn" }, 404);
  }

  const evaluatedRoom = await waitingRoomService.evaluateAndActivate(courseId);
  const persistedRoom = await prisma.waitingRoom.findUnique({
    where: { courseId },
  });
  const waitingRoom = evaluatedRoom ?? persistedRoom;
  const buffer = waitingRoom?.buffer ?? 5;
  const waitingActive = Boolean(waitingRoom?.isActive);

  const includeConfig = {
    room: true,
    timeSlot: true,
  } as const;

  const [normalSections, waitingSectionsRaw] = await Promise.all([
    prisma.section.findMany({
      where: {
        courseId,
        status: "OPEN",
        isWaitingOption: false,
      },
      include: includeConfig,
      orderBy: { code: "asc" },
    }),
    waitingActive
      ? prisma.section.findMany({
          where: {
            courseId,
            status: "OPEN",
            isWaitingOption: true,
          },
          include: includeConfig,
          orderBy: { code: "asc" },
        })
      : Promise.resolve([]),
  ]);

  return ok({
    course: courseBase,
    waitingRoom,
    sections: normalSections.map((section) => mapSectionForStudent(section, buffer)),
    waitingSections: waitingSectionsRaw.map((section) => mapSectionForStudent(section, buffer)),
  });
}

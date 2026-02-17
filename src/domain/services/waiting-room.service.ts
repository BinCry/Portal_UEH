import { ApprovalStatus } from "@prisma/client";
import { WAITING_BUFFER_DEFAULT, WAITING_SLA_HOURS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { addHoursFromNow, now } from "@/lib/time";
import { notificationService } from "@/domain/services/notification.service";

const getSectionAvailableSlots = (capacity: number, registered: number, reserved: number) =>
  capacity - registered - reserved;

export const waitingRoomService = {
  async getOrCreateByCourse(courseId: string, buffer = WAITING_BUFFER_DEFAULT) {
    const room = await prisma.waitingRoom.upsert({
      where: { courseId },
      update: {},
      create: {
        courseId,
        buffer,
        slaHours: WAITING_SLA_HOURS,
      },
    });
    return room;
  },

  async evaluateAndActivate(courseId: string) {
    const [course, sections] = await Promise.all([
      prisma.course.findUnique({
        where: { id: courseId },
        select: { code: true, name: true },
      }),
      prisma.section.findMany({
        where: { courseId, status: "OPEN", isWaitingOption: false },
        select: {
          id: true,
          capacity: true,
          registeredCount: true,
          reservedCount: true,
        },
      }),
    ]);

    if (!sections.length) return null;

    const room = await this.getOrCreateByCourse(courseId);
    const allFull = sections.every((s) => getSectionAvailableSlots(s.capacity, s.registeredCount, s.reservedCount) <= 0);
    const anyNearFull = sections.some(
      (s) => getSectionAvailableSlots(s.capacity, s.registeredCount, s.reservedCount) <= room.buffer,
    );

    if (!allFull && !anyNearFull) return room;

    if (!room.isActive) {
      const activatedAt = now();
      await prisma.$transaction([
        prisma.waitingRoom.update({
          where: { id: room.id },
          data: {
            isActive: true,
            activatedAt,
          },
        }),
        prisma.approval.create({
          data: {
            waitingRoomId: room.id,
            status: ApprovalStatus.PENDING,
            dueAt: addHoursFromNow(room.slaHours),
          },
        }),
      ]);

      await notificationService.createForAdmins("SYSTEM", {
        title: "Phòng chờ đã kích hoạt",
        message: `Học phần ${course?.code ?? ""} đã đạt ngưỡng kích hoạt phòng chờ. Vui lòng xử lý phê duyệt trong SLA 48h.`,
        waitingRoomId: room.id,
        courseCode: course?.code ?? null,
        courseName: course?.name ?? null,
        activatedAt: activatedAt.toISOString(),
      });

      return prisma.waitingRoom.findUnique({
        where: { id: room.id },
      });
    }

    return room;
  },
};

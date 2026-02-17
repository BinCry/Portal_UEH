import { NotificationType, WaitingEntryState } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { now } from "@/lib/time";
import { hasScheduleConflict } from "@/domain/policies/schedule";
import { notificationService } from "@/domain/services/notification.service";

type PriorityOption = {
  sectionId: string;
};

const getAvailableSlots = (capacity: number, registeredCount: number, reservedCount: number) =>
  capacity - registeredCount - reservedCount;

const parsePriorities = (value: unknown): PriorityOption[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) =>
      typeof item === "object" && item && "sectionId" in item
        ? { sectionId: String((item as { sectionId: string }).sectionId) }
        : null,
    )
    .filter(Boolean) as PriorityOption[];
};

const isPenaltyActive = (date?: Date | null) => Boolean(date && date.getTime() > now().getTime());

export const matchingService = {
  async matchWaitingRoom(waitingRoomId: string) {
    const queue = await prisma.waitingEntry.findMany({
      where: {
        waitingRoomId,
        state: WaitingEntryState.QUEUED,
      },
      orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
      include: {
        student: {
          select: {
            email: true,
            studentProfile: {
              select: {
                studentCode: true,
                fullName: true,
                priorityPenaltyUntil: true,
              },
            },
          },
        },
        waitingRoom: {
          include: {
            course: {
              select: { code: true, name: true },
            },
          },
        },
      },
    });

    let pendingAdmin = 0;
    let failed = 0;

    for (const entry of queue) {
      const priorities = parsePriorities(entry.prioritiesJson);
      if (!priorities.length) {
        await prisma.waitingEntry.update({
          where: { id: entry.id },
          data: {
            state: WaitingEntryState.FAILED,
            reason: "Khong co nguyen vong hop le",
          },
        });
        await notificationService.create(entry.studentId, "SYSTEM", {
          title: "Phong cho chua the cap lop",
          message: `Yeu cau phong cho hoc phan ${entry.waitingRoom.course.code} chua co nguyen vong hop le.`,
          waitingEntryId: entry.id,
          waitingRoomId,
        });
        failed += 1;
        continue;
      }

      const priorityPenaltyActive = isPenaltyActive(entry.student.studentProfile?.priorityPenaltyUntil);
      const effectivePriorities = priorityPenaltyActive ? priorities.slice(1) : priorities;

      if (!effectivePriorities.length) {
        await prisma.waitingEntry.update({
          where: { id: entry.id },
          data: {
            state: WaitingEntryState.FAILED,
            reason: "Dang tam mat quyen uu tien, vui long cap nhat lai nguyen vong",
          },
        });
        await notificationService.create(entry.studentId, "SYSTEM", {
          title: "Phong cho chua the cap lop",
          message:
            "Ban dang bi mat quyen uu tien tam thoi, he thong chua the xet nguyen vong hien tai. Vui long cap nhat lai danh sach uu tien.",
          waitingEntryId: entry.id,
          waitingRoomId,
        });
        failed += 1;
        continue;
      }

      const existingEnrollments = await prisma.enrollment.findMany({
        where: {
          studentId: entry.studentId,
          status: "ENROLLED",
        },
        include: {
          section: {
            include: {
              timeSlot: true,
            },
          },
        },
      });

      let assignedSectionId: string | null = null;
      let assignedSectionCode: string | null = null;
      let matchedPriority: number | null = null;

      for (const [priorityIndex, option] of priorities.entries()) {
        if (priorityPenaltyActive && priorityIndex === 0) {
          continue;
        }

        const section = await prisma.section.findUnique({
          where: { id: option.sectionId },
          include: { timeSlot: true },
        });
        if (!section || section.status !== "OPEN" || !section.isWaitingOption) continue;

        const available = getAvailableSlots(section.capacity, section.registeredCount, section.reservedCount);
        if (available <= 0) continue;

        const hasConflict = hasScheduleConflict(
          section,
          existingEnrollments.map((enrollment) => enrollment.section),
        );
        if (hasConflict) continue;

        await prisma.section.update({
          where: { id: section.id },
          data: { reservedCount: { increment: 1 } },
        });

        assignedSectionId = section.id;
        assignedSectionCode = section.code;
        matchedPriority = priorityIndex + 1;
        break;
      }

      if (!assignedSectionId || !matchedPriority) {
        await prisma.waitingEntry.update({
          where: { id: entry.id },
          data: {
            state: WaitingEntryState.FAILED,
            reason: "Khong tim thay lop bo sung phu hop theo nguyen vong",
          },
        });
        await notificationService.create(entry.studentId, "SYSTEM", {
          title: "Phong cho chua the cap lop",
          message:
            "Chua tim duoc lop bo sung phu hop theo 3 nguyen vong cua ban. Ban co the cap nhat nguyen vong hoac cho dot tiep theo.",
          waitingEntryId: entry.id,
          waitingRoomId,
          courseCode: entry.waitingRoom.course.code,
          courseName: entry.waitingRoom.course.name,
        });
        failed += 1;
        continue;
      }

      await prisma.waitingEntry.update({
        where: { id: entry.id },
        data: {
          state: WaitingEntryState.PENDING_ADMIN,
          offerSectionId: assignedSectionId,
          matchedPriority,
          expiresAt: null,
          lastNotifiedAt: now(),
          reason:
            matchedPriority === 1
              ? "He thong de xuat theo uu tien 1, cho admin duyet"
              : `Uu tien 1 het cho, de xuat theo uu tien ${matchedPriority}, cho admin duyet`,
        },
      });

      await Promise.all([
        notificationService.create(entry.studentId, NotificationType.SYSTEM, {
          title: "Da tim thay lop bo sung, dang cho admin duyet",
          message:
            matchedPriority === 1
              ? `He thong da tim thay lop ${assignedSectionCode ?? assignedSectionId} theo uu tien 1. Vui long cho admin duyet.`
              : `Uu tien 1 hien da het cho. He thong de xuat lop ${assignedSectionCode ?? assignedSectionId} theo uu tien ${matchedPriority} va dang cho admin duyet.`,
          waitingEntryId: entry.id,
          waitingRoomId,
          sectionId: assignedSectionId,
          sectionCode: assignedSectionCode,
          matchedPriority,
          pendingAdminReview: true,
        }),
        notificationService.createForAdmins(NotificationType.SYSTEM, {
          title: "Can duyet de xuat phong cho",
          message: `${entry.student.studentProfile?.fullName ?? entry.student.email} dang cho duyet de xuat lop ${
            assignedSectionCode ?? assignedSectionId
          } (uu tien ${matchedPriority}) cho hoc phan ${entry.waitingRoom.course.code}.`,
          waitingEntryId: entry.id,
          waitingRoomId,
          studentId: entry.studentId,
          studentCode: entry.student.studentProfile?.studentCode ?? null,
          studentName: entry.student.studentProfile?.fullName ?? null,
          sectionId: assignedSectionId,
          sectionCode: assignedSectionCode,
          courseCode: entry.waitingRoom.course.code,
          courseName: entry.waitingRoom.course.name,
          matchedPriority,
          pendingAdminReview: true,
        }),
      ]);

      pendingAdmin += 1;
    }

    return {
      totalQueued: queue.length,
      pendingAdmin,
      failed,
    };
  },
};

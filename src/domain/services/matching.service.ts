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
            reason: "Không có nguyện vọng hợp lệ",
          },
        });
        await notificationService.create(entry.studentId, "SYSTEM", {
          title: "Phòng chờ chưa thể cấp lớp",
          message: `Yêu cầu phòng chờ học phần ${entry.waitingRoom.course.code} chưa có nguyện vọng hợp lệ.`,
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
            reason: "Đang tạm mất quyền ưu tiên, vui lòng cập nhật lại nguyện vọng",
          },
        });
        await notificationService.create(entry.studentId, "SYSTEM", {
          title: "Phòng chờ chưa thể cấp lớp",
          message:
            "Bạn đang bị mất quyền ưu tiên tạm thời, hệ thống chưa thể xét nguyện vọng hiện tại. Vui lòng cập nhật lại danh sách ưu tiên.",
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
            reason: "Không tìm thấy lớp bổ sung phù hợp theo nguyện vọng",
          },
        });
        await notificationService.create(entry.studentId, "SYSTEM", {
          title: "Phòng chờ chưa thể cấp lớp",
          message:
            "Chưa tìm được lớp bổ sung phù hợp theo 3 nguyện vọng của bạn. Bạn có thể cập nhật nguyện vọng hoặc chờ đợt tiếp theo.",
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
              ? "Hệ thống đề xuất theo ưu tiên 1, chờ admin duyệt"
              : `Ưu tiên 1 hết chỗ, đề xuất theo ưu tiên ${matchedPriority}, chờ admin duyệt`,
        },
      });

      await Promise.all([
        notificationService.create(entry.studentId, NotificationType.SYSTEM, {
          title: "Đã tìm thấy lớp bổ sung, đang chờ admin duyệt",
          message:
            matchedPriority === 1
              ? `Hệ thống đã tìm thấy lớp ${assignedSectionCode ?? assignedSectionId} theo ưu tiên 1. Vui lòng chờ admin duyệt.`
              : `Ưu tiên 1 hiện đã hết chỗ. Hệ thống đề xuất lớp ${assignedSectionCode ?? assignedSectionId} theo ưu tiên ${matchedPriority} và đang chờ admin duyệt.`,
          waitingEntryId: entry.id,
          waitingRoomId,
          sectionId: assignedSectionId,
          sectionCode: assignedSectionCode,
          matchedPriority,
          pendingAdminReview: true,
        }),
        notificationService.createForAdmins(NotificationType.SYSTEM, {
          title: "Cần duyệt đề xuất phòng chờ",
          message: `${entry.student.studentProfile?.fullName ?? entry.student.email} đang chờ duyệt đề xuất lớp ${
            assignedSectionCode ?? assignedSectionId
          } (ưu tiên ${matchedPriority}) cho học phần ${entry.waitingRoom.course.code}.`,
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

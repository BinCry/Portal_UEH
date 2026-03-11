import { ApprovalStatus, NotificationType, Prisma, WaitingEntryState } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { now } from "@/lib/time";
import { hasScheduleConflict } from "@/domain/policies/schedule";
import { notificationService } from "@/domain/services/notification.service";
import { deriveWaitingRoomOperationalStatus } from "@/domain/services/waiting-room-state.service";

type PriorityOption = {
  sectionId: string;
};

type NotificationDraft =
  | {
      target: "student";
      userId: string;
      type: NotificationType;
      payload: Prisma.JsonObject;
    }
  | {
      target: "admins";
      type: NotificationType;
      payload: Prisma.JsonObject;
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
    const result = await prisma.$transaction(async (tx) => {
      // Serialize matching by waiting room to avoid duplicate offer assignment.
      const roomLock = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM "WaitingRoom"
        WHERE id = ${waitingRoomId}
        FOR UPDATE
      `;
      if (!roomLock.length) {
        return {
          totalQueued: 0,
          pendingAdmin: 0,
          failed: 0,
          notifications: [] as NotificationDraft[],
        };
      }

      const [room, pendingApproval, latestApproval, approvalsCount] = await Promise.all([
        tx.waitingRoom.findUnique({
          where: { id: waitingRoomId },
          select: {
            id: true,
            isActive: true,
          },
        }),
        tx.approval.findFirst({
          where: {
            waitingRoomId,
            status: ApprovalStatus.PENDING,
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            status: true,
            reason: true,
            updatedAt: true,
            dueAt: true,
          },
        }),
        tx.approval.findFirst({
          where: {
            waitingRoomId,
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            status: true,
            reason: true,
            updatedAt: true,
            dueAt: true,
          },
        }),
        tx.approval.count({
          where: {
            waitingRoomId,
          },
        }),
      ]);

      const queue = await tx.waitingEntry.findMany({
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

      const roomStatus = deriveWaitingRoomOperationalStatus({
        isActive: room?.isActive ?? false,
        approvalsCount,
        queuedCount: queue.length,
        pendingAdminCount: 0,
        offeredCount: 0,
        latestApproval,
        pendingApproval,
      });

      if (roomStatus !== "APPROVED_ACTIVE") {
        return {
          totalQueued: queue.length,
          pendingAdmin: 0,
          failed: 0,
          notifications: [] as NotificationDraft[],
        };
      }

      let pendingAdmin = 0;
      let failed = 0;
      const notifications: NotificationDraft[] = [];

      for (const entry of queue) {
        const priorities = parsePriorities(entry.prioritiesJson);

        const failCurrentEntry = async (reason: string, message: string) => {
          const updated = await tx.waitingEntry.updateMany({
            where: {
              id: entry.id,
              state: WaitingEntryState.QUEUED,
            },
            data: {
              state: WaitingEntryState.FAILED,
              reason,
            },
          });
          if (!updated.count) {
            return;
          }

          failed += 1;
          notifications.push({
            target: "student",
            userId: entry.studentId,
            type: NotificationType.SYSTEM,
            payload: {
              title: "Phong cho chua the cap lop",
              message,
              waitingEntryId: entry.id,
              waitingRoomId,
              courseCode: entry.waitingRoom.course.code,
              courseName: entry.waitingRoom.course.name,
            },
          });
        };

        if (!priorities.length) {
          await failCurrentEntry("Khong co nguyen vong hop le", "Yeu cau phong cho chua co nguyen vong hop le.");
          continue;
        }

        const priorityPenaltyActive = isPenaltyActive(entry.student.studentProfile?.priorityPenaltyUntil);
        const effectivePriorities = priorityPenaltyActive ? priorities.slice(1) : priorities;

        if (!effectivePriorities.length) {
          await failCurrentEntry(
            "Dang tam mat quyen uu tien, vui long cap nhat lai nguyen vong",
            "Ban dang bi mat quyen uu tien tam thoi, he thong chua the xet nguyen vong hien tai.",
          );
          continue;
        }

        const existingEnrollments = await tx.enrollment.findMany({
          where: {
            studentId: entry.studentId,
            status: "ENROLLED",
          },
          select: {
            courseId: true,
            section: {
              include: {
                timeSlot: true,
              },
            },
          },
        });

        if (existingEnrollments.some((enrollment) => enrollment.courseId === entry.waitingRoom.courseId)) {
          await failCurrentEntry(
            "Sinh vien da co lop ENROLLED cho hoc phan nay",
            "Ban da dang ky hoc phan nay o lop khac. Khong the xep them tu phong cho.",
          );
          continue;
        }

        let assignedSectionId: string | null = null;
        let assignedSectionCode: string | null = null;
        let matchedPriority: number | null = null;

        for (const [priorityIndex, option] of priorities.entries()) {
          if (priorityPenaltyActive && priorityIndex === 0) {
            continue;
          }

          const section = await tx.section.findUnique({
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

          const reserved = await tx.section.updateMany({
            where: {
              id: section.id,
              status: "OPEN",
              isWaitingOption: true,
              registeredCount: section.registeredCount,
              reservedCount: section.reservedCount,
            },
            data: { reservedCount: { increment: 1 } },
          });
          if (!reserved.count) {
            continue;
          }

          assignedSectionId = section.id;
          assignedSectionCode = section.code;
          matchedPriority = priorityIndex + 1;
          break;
        }

        if (!assignedSectionId || !matchedPriority) {
          await failCurrentEntry(
            "Khong tim thay lop bo sung phu hop theo nguyen vong",
            "Chua tim duoc lop bo sung phu hop theo danh sach nguyen vong cua ban.",
          );
          continue;
        }

        const pendingUpdate = await tx.waitingEntry.updateMany({
          where: {
            id: entry.id,
            state: WaitingEntryState.QUEUED,
          },
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

        if (!pendingUpdate.count) {
          await tx.section.updateMany({
            where: {
              id: assignedSectionId,
              reservedCount: {
                gt: 0,
              },
            },
            data: {
              reservedCount: { decrement: 1 },
            },
          });
          continue;
        }

        notifications.push(
          {
            target: "student",
            userId: entry.studentId,
            type: NotificationType.SYSTEM,
            payload: {
              title: "Da tim thay lop bo sung, dang cho admin duyet",
              message:
                matchedPriority === 1
                  ? `He thong da tim thay lop ${assignedSectionCode ?? assignedSectionId} theo uu tien 1. Vui long cho admin duyet.`
                  : `Uu tien 1 hien da het cho. He thong de xuat lop ${assignedSectionCode ?? assignedSectionId} theo uu tien ${matchedPriority}.`,
              waitingEntryId: entry.id,
              waitingRoomId,
              sectionId: assignedSectionId,
              sectionCode: assignedSectionCode,
              matchedPriority,
              pendingAdminReview: true,
            },
          },
          {
            target: "admins",
            type: NotificationType.SYSTEM,
            payload: {
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
            },
          },
        );

        pendingAdmin += 1;
      }

      return {
        totalQueued: queue.length,
        pendingAdmin,
        failed,
        notifications,
      };
    });

    await Promise.all(
      result.notifications.map((item) =>
        item.target === "student"
          ? notificationService.create(item.userId, item.type, item.payload)
          : notificationService.createForAdmins(item.type, item.payload),
      ),
    );

    return {
      totalQueued: result.totalQueued,
      pendingAdmin: result.pendingAdmin,
      failed: result.failed,
    };
  },
};

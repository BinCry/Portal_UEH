import { ApprovalStatus, NotificationType, WaitingEntryState } from "@prisma/client";
import { WAITING_OFFER_EXPIRE_HOURS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { addHoursFromNow, now } from "@/lib/time";
import { matchingService } from "@/domain/services/matching.service";
import { notificationService } from "@/domain/services/notification.service";
import { formatSectionScheduleSummary } from "@/lib/section-display";

const hasAvailableSlot = (capacity: number, registeredCount: number, reservedCount: number) =>
  capacity - registeredCount - reservedCount > 0;

const activeEntryStates: WaitingEntryState[] = [
  WaitingEntryState.QUEUED,
  WaitingEntryState.PENDING_ADMIN,
  WaitingEntryState.OFFERED,
];

const toOfferMessage = (matchedPriority: number | null, sectionCode: string | null) => {
  if (matchedPriority === 1) {
    return `Admin đã duyệt đề xuất ưu tiên 1 (${sectionCode ?? "lớp bổ sung"}). Vui lòng xác nhận lần cuối trong 24 giờ.`;
  }
  return `Ưu tiên 1 hiện đã hết chỗ. Admin đã duyệt đề xuất ưu tiên ${matchedPriority ?? "-"} (${sectionCode ?? "lớp bổ sung"}). Vui lòng xác nhận lần cuối trong 24 giờ.`;
};

const autoApprovePendingEntriesForRoom = async (waitingRoomId: string) => {
  const pendingEntries = await prisma.waitingEntry.findMany({
    where: {
      waitingRoomId,
      state: WaitingEntryState.PENDING_ADMIN,
      offerSectionId: { not: null },
    },
    include: {
      waitingRoom: {
        include: {
          course: {
            select: { code: true, name: true },
          },
        },
      },
      offerSection: {
        include: {
          timeSlot: true,
          room: true,
        },
      },
    },
  });

  for (const entry of pendingEntries) {
    const expiresAt = addHoursFromNow(WAITING_OFFER_EXPIRE_HOURS);
    await prisma.waitingEntry.update({
      where: { id: entry.id },
      data: {
        state: WaitingEntryState.OFFERED,
        expiresAt,
        lastNotifiedAt: now(),
        reason: "Hệ thống tự động phê duyệt đề xuất quá SLA",
      },
    });

    await notificationService.create(entry.studentId, NotificationType.WAITING_OFFER, {
      title: "Đã có đề xuất lớp từ phòng chờ",
      message: toOfferMessage(entry.matchedPriority, entry.offerSection?.code ?? null),
      waitingEntryId: entry.id,
      waitingRoomId: entry.waitingRoomId,
      sectionId: entry.offerSection?.id ?? null,
      sectionCode: entry.offerSection?.code ?? null,
      matchedPriority: entry.matchedPriority,
      expiresAt: expiresAt.toISOString(),
      requiresFinalConfirmation: true,
      autoApproved: true,
      courseName: entry.waitingRoom.course.name,
      schedule: entry.offerSection
        ? formatSectionScheduleSummary({
          dayOfWeek: entry.offerSection.dayOfWeek,
          startTime: entry.offerSection.timeSlot.startTime,
          endTime: entry.offerSection.timeSlot.endTime,
          startDate: entry.offerSection.startDate,
          endDate: entry.offerSection.endDate,
          address: entry.offerSection.room.address,
          campus: entry.offerSection.room.campus,
          roomCode: entry.offerSection.room.code,
        })
        : undefined,
    });
  }

  return pendingEntries.length;
};

export const approvalService = {
  async manualApprove(waitingRoomId: string, approvedById: string, reason?: string) {
    const { approval, room, entries } = await prisma.$transaction(async (tx) => {
      const room = await tx.waitingRoom.findUnique({
        where: { id: waitingRoomId },
        include: {
          course: {
            select: { code: true, name: true },
          },
        },
      });

      if (!room) {
        throw new Error("Khong tim thay phong cho");
      }

      const pending = await tx.approval.findFirst({
        where: { waitingRoomId, status: ApprovalStatus.PENDING },
        orderBy: { createdAt: "desc" },
      });

      const latestApproval = await tx.approval.findFirst({
        where: { waitingRoomId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });

      const approval = pending
        ? await tx.approval.update({
          where: { id: pending.id },
          data: {
            status: ApprovalStatus.APPROVED,
            approvedById,
            reason: reason ?? "Phe duyet thu cong",
          },
        })
        : latestApproval &&
            room.isActive &&
            (latestApproval.status === ApprovalStatus.APPROVED || latestApproval.status === ApprovalStatus.AUTO_APPROVED)
          ? latestApproval
          : await tx.approval.create({
            data: {
              waitingRoomId,
              status: ApprovalStatus.APPROVED,
              approvedById,
              reason: reason ?? "Phe duyet thu cong",
              dueAt: now(),
            },
          });

      const entries = await tx.waitingEntry.findMany({
        where: {
          waitingRoomId,
          state: {
            in: activeEntryStates,
          },
        },
        select: {
          id: true,
          studentId: true,
        },
      });

      return { approval, room, entries };
    });

    if (room) {
      await notificationService.createForUsers(
        entries.map((entry) => entry.studentId),
        "SYSTEM",
        {
          title: "Phong cho da duoc phe duyet",
          message:
            "Phong dao tao da phe duyet phong cho. He thong dang map nguyen vong va gui tung de xuat de admin duyet cuoi.",
          waitingRoomId,
          courseCode: room.course.code,
          courseName: room.course.name,
        },
      );

      await notificationService.createForAdmins(
        "SYSTEM",
        {
          title: "Da phe duyet phong cho",
          message: `Phong cho hoc phan ${room.course.code} da duoc phe duyet.`,
          waitingRoomId,
          courseCode: room.course.code,
          courseName: room.course.name,
          approvalStatus: ApprovalStatus.APPROVED,
        },
        approvedById,
      );
    }

    const matchResult = await matchingService.matchWaitingRoom(waitingRoomId);
    if (room) {
      await notificationService.createForAdmins("SYSTEM", {
        title: "Ket qua map hang doi",
        message: `Hoc phan ${room.course.code}: ${matchResult.pendingAdmin} de xuat dang cho admin duyet, ${matchResult.failed} khong phan duoc.`,
        waitingRoomId,
        courseCode: room.course.code,
        pendingAdmin: matchResult.pendingAdmin,
        failed: matchResult.failed,
      });
    }

    return approval;
  },

  async manualReject(waitingRoomId: string, approvedById: string, reason: string) {
    const { approval, entries, room } = await prisma.$transaction(async (tx) => {
      const pending = await tx.approval.findFirst({
        where: { waitingRoomId, status: ApprovalStatus.PENDING },
        orderBy: { createdAt: "desc" },
      });

      const approval = pending
        ? await tx.approval.update({
          where: { id: pending.id },
          data: {
            status: ApprovalStatus.REJECTED,
            approvedById,
            reason,
          },
        })
        : await tx.approval.create({
          data: {
            waitingRoomId,
            status: ApprovalStatus.REJECTED,
            approvedById,
            reason,
            dueAt: now(),
          },
        });

      const room = await tx.waitingRoom.findUnique({
        where: { id: waitingRoomId },
        include: {
          course: {
            select: { code: true, name: true },
          },
        },
      });

      const entries = await tx.waitingEntry.findMany({
        where: {
          waitingRoomId,
          state: {
            in: activeEntryStates,
          },
        },
        select: {
          id: true,
          studentId: true,
          offerSectionId: true,
        },
      });

      await tx.waitingEntry.updateMany({
        where: {
          waitingRoomId,
          state: {
            in: activeEntryStates,
          },
        },
        data: {
          state: WaitingEntryState.DEFERRED,
          reason,
        },
      });

      const sectionReleaseMap = new Map<string, number>();
      for (const entry of entries) {
        if (!entry.offerSectionId) continue;
        sectionReleaseMap.set(entry.offerSectionId, (sectionReleaseMap.get(entry.offerSectionId) ?? 0) + 1);
      }
      for (const [sectionId, count] of sectionReleaseMap.entries()) {
        const currentSection = await tx.section.findUnique({
          where: { id: sectionId },
          select: { reservedCount: true },
        });
        if (!currentSection || currentSection.reservedCount <= 0) continue;

        await tx.section.update({
          where: { id: sectionId },
          data: {
            reservedCount: { decrement: Math.min(count, currentSection.reservedCount) },
          },
        });
      }

      await tx.waitingRoom.update({
        where: { id: waitingRoomId },
        data: {
          isActive: false,
        },
      });

      return { approval, entries, room };
    });

    await notificationService.createForUsers(
      entries.map((entry) => entry.studentId),
      "WAITING_REJECTED",
      {
        title: "Phòng chờ đã bị từ chối",
        message: reason,
        waitingRoomId,
      },
    );

    if (room) {
      await notificationService.createForAdmins(
        "SYSTEM",
        {
          title: "Đã từ chối phòng chờ",
          message: `Phòng chờ học phần ${room.course.code} đã bị từ chối.`,
          waitingRoomId,
          courseCode: room.course.code,
          courseName: room.course.name,
          approvalStatus: ApprovalStatus.REJECTED,
          reason,
        },
        approvedById,
      );
    }

    return approval;
  },

  async approveEntry(waitingEntryId: string, approvedById: string, reason?: string) {
    const expiresAt = addHoursFromNow(WAITING_OFFER_EXPIRE_HOURS);

    const entry = await prisma.$transaction(async (tx) => {
      const target = await tx.waitingEntry.findUnique({
        where: { id: waitingEntryId },
        include: {
          waitingRoom: {
            include: {
              course: {
                select: { code: true, name: true },
              },
            },
          },
          offerSection: {
            include: { timeSlot: true, room: true },
          },
        },
      });

      if (!target) {
        throw new Error("Không tìm thấy đề xuất phòng chờ");
      }
      if (target.state !== WaitingEntryState.PENDING_ADMIN) {
        throw new Error("Chỉ có thể duyệt đề xuất đang chờ admin");
      }
      if (!target.offerSectionId) {
        throw new Error("Đề xuất chưa có lớp để xếp");
      }

      return tx.waitingEntry.update({
        where: { id: waitingEntryId },
        data: {
          state: WaitingEntryState.OFFERED,
          expiresAt,
          reason: reason ?? target.reason ?? "Admin đã duyệt đề xuất",
          lastNotifiedAt: now(),
        },
        include: {
          waitingRoom: {
            include: {
              course: {
                select: { code: true, name: true },
              },
            },
          },
          offerSection: {
            include: { timeSlot: true, room: true },
          },
        },
      });
    });

    await Promise.all([
      notificationService.create(entry.studentId, NotificationType.WAITING_OFFER, {
        title: "Admin đã duyệt đề xuất phòng chờ",
        message: toOfferMessage(entry.matchedPriority, entry.offerSection?.code ?? null),
        waitingEntryId: entry.id,
        waitingRoomId: entry.waitingRoomId,
        sectionId: entry.offerSection?.id ?? null,
        sectionCode: entry.offerSection?.code ?? null,
        matchedPriority: entry.matchedPriority,
        expiresAt: expiresAt.toISOString(),
        requiresFinalConfirmation: true,
        courseName: entry.waitingRoom.course.name,
        schedule: entry.offerSection
          ? formatSectionScheduleSummary({
            dayOfWeek: entry.offerSection.dayOfWeek,
            startTime: entry.offerSection.timeSlot.startTime,
            endTime: entry.offerSection.timeSlot.endTime,
            startDate: entry.offerSection.startDate,
            endDate: entry.offerSection.endDate,
            address: entry.offerSection.room.address,
            campus: entry.offerSection.room.campus,
            roomCode: entry.offerSection.room.code,
          })
          : undefined,
      }),
      notificationService.createForAdmins(
        NotificationType.SYSTEM,
        {
          title: "Đã duyệt đề xuất cho sinh viên",
          message: `Entry ${entry.id} đã được duyệt và gửi cho sinh viên xác nhận lần cuối.`,
          waitingEntryId: entry.id,
          waitingRoomId: entry.waitingRoomId,
          sectionId: entry.offerSection?.id ?? null,
          sectionCode: entry.offerSection?.code ?? null,
          matchedPriority: entry.matchedPriority,
          courseCode: entry.waitingRoom.course.code,
          courseName: entry.waitingRoom.course.name,
        },
        approvedById,
      ),
    ]);

    return entry;
  },

  async rejectEntry(waitingEntryId: string, approvedById: string, reason: string) {
    const entry = await prisma.$transaction(async (tx) => {
      const target = await tx.waitingEntry.findUnique({
        where: { id: waitingEntryId },
        include: {
          waitingRoom: {
            include: {
              course: {
                select: { code: true, name: true },
              },
            },
          },
        },
      });

      if (!target) {
        throw new Error("Không tìm thấy đề xuất phòng chờ");
      }
      if (target.state !== WaitingEntryState.PENDING_ADMIN) {
        throw new Error("Chỉ có thể từ chối đề xuất đang chờ admin");
      }

      const updated = await tx.waitingEntry.update({
        where: { id: waitingEntryId },
        data: {
          state: WaitingEntryState.DEFERRED,
          reason,
          expiresAt: null,
        },
      });

      if (target.offerSectionId) {
        await tx.section.updateMany({
          where: {
            id: target.offerSectionId,
            reservedCount: {
              gt: 0,
            },
          },
          data: {
            reservedCount: { decrement: 1 },
          },
        });
      }

      return {
        ...updated,
        waitingRoom: target.waitingRoom,
        offerSectionId: target.offerSectionId,
      };
    });

    await Promise.all([
      notificationService.create(entry.studentId, NotificationType.WAITING_REJECTED, {
        title: "Đề xuất phòng chờ đã bị từ chối",
        message: reason,
        waitingEntryId: entry.id,
        waitingRoomId: entry.waitingRoomId,
        sectionId: entry.offerSectionId,
      }),
      notificationService.createForAdmins(
        NotificationType.SYSTEM,
        {
          title: "Đã từ chối đề xuất cho sinh viên",
          message: `Entry ${entry.id} đã bị từ chối. Hệ thống sẽ phân bổ lại suất cho hàng đợi tiếp theo.`,
          waitingEntryId: entry.id,
          waitingRoomId: entry.waitingRoomId,
          sectionId: entry.offerSectionId,
          reason,
          courseCode: entry.waitingRoom.course.code,
          courseName: entry.waitingRoom.course.name,
        },
        approvedById,
      ),
    ]);

    await matchingService.matchWaitingRoom(entry.waitingRoomId);

    return entry;
  },

  async scanSlaAndAutoResolve() {
    const overdueApprovals = await prisma.approval.findMany({
      where: {
        status: ApprovalStatus.PENDING,
        dueAt: {
          lte: now(),
        },
      },
      include: {
        waitingRoom: {
          include: {
            course: {
              include: {
                sections: true,
              },
            },
            entries: {
              where: {
                state: {
                  in: activeEntryStates,
                },
              },
              select: {
                id: true,
                studentId: true,
                offerSectionId: true,
              },
            },
          },
        },
      },
    });

    let autoApproved = 0;
    let rejected = 0;

    for (const approval of overdueApprovals) {
      const sections = approval.waitingRoom.course.sections.filter((s) => s.status === "OPEN");
      const canAutoApprove = sections.some((s) => hasAvailableSlot(s.capacity, s.registeredCount, s.reservedCount));

      if (canAutoApprove) {
        await prisma.approval.update({
          where: { id: approval.id },
          data: {
            status: ApprovalStatus.AUTO_APPROVED,
            reason: "Quá SLA 48h và hệ thống tự động phê duyệt",
          },
        });

        await notificationService.createForUsers(
          approval.waitingRoom.entries.map((entry) => entry.studentId),
          "SYSTEM",
          {
            title: "Phòng chờ được tự động phê duyệt",
            message:
              "Phòng chờ đã quá SLA 48h nên hệ thống tự động phê duyệt và sẽ tiếp tục xử lý đề xuất lớp.",
            waitingRoomId: approval.waitingRoomId,
            courseCode: approval.waitingRoom.course.code,
            requiresFinalConfirmation: true,
          },
        );

        const matchResult = await matchingService.matchWaitingRoom(approval.waitingRoomId);
        const autoOffered = await autoApprovePendingEntriesForRoom(approval.waitingRoomId);

        await notificationService.createForAdmins("SYSTEM", {
          title: "SLA tự động phê duyệt phòng chờ",
          message: `Học phần ${approval.waitingRoom.course.code}: ${autoOffered} đề xuất đã gửi cho sinh viên xác nhận, ${matchResult.failed} chưa phân được.`,
          waitingRoomId: approval.waitingRoomId,
          courseCode: approval.waitingRoom.course.code,
          autoOffered,
          pendingAdmin: matchResult.pendingAdmin,
          failed: matchResult.failed,
        });
        autoApproved += 1;
      } else {
        const reason = "Quá SLA 48h nhưng không còn slot khả dụng";
        await prisma.$transaction(async (tx) => {
          await tx.approval.update({
            where: { id: approval.id },
            data: {
              status: ApprovalStatus.REJECTED,
              reason,
            },
          });

          await tx.waitingEntry.updateMany({
            where: {
              waitingRoomId: approval.waitingRoomId,
              state: {
                in: activeEntryStates,
              },
            },
            data: {
              state: WaitingEntryState.DEFERRED,
              reason,
            },
          });

          const sectionReleaseMap = new Map<string, number>();
          for (const entry of approval.waitingRoom.entries) {
            if (!entry.offerSectionId) continue;
            sectionReleaseMap.set(entry.offerSectionId, (sectionReleaseMap.get(entry.offerSectionId) ?? 0) + 1);
          }
          for (const [sectionId, count] of sectionReleaseMap.entries()) {
            const currentSection = await tx.section.findUnique({
              where: { id: sectionId },
              select: { reservedCount: true },
            });
            if (!currentSection || currentSection.reservedCount <= 0) continue;

            await tx.section.update({
              where: { id: sectionId },
              data: {
                reservedCount: { decrement: Math.min(count, currentSection.reservedCount) },
              },
            });
          }

          await tx.waitingRoom.update({
            where: { id: approval.waitingRoomId },
            data: { isActive: false },
          });
        });

        await notificationService.createForUsers(
          approval.waitingRoom.entries.map((entry) => entry.studentId),
          "WAITING_REJECTED",
          {
            title: "Phòng chờ bị từ chối do quá SLA",
            message: reason,
            waitingRoomId: approval.waitingRoomId,
            courseCode: approval.waitingRoom.course.code,
          },
        );
        await notificationService.createForAdmins("SYSTEM", {
          title: "SLA tự động từ chối phòng chờ",
          message: `Học phần ${approval.waitingRoom.course.code} đã bị từ chối vì không còn slot khả dụng.`,
          waitingRoomId: approval.waitingRoomId,
          courseCode: approval.waitingRoom.course.code,
        });
        rejected += 1;
      }
    }

    return {
      scanned: overdueApprovals.length,
      autoApproved,
      rejected,
    };
  },
};

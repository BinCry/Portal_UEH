import { ApprovalStatus, NotificationType, WaitingEntryState } from "@prisma/client";
import { WAITING_OFFER_EXPIRE_HOURS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { addHoursFromNow, now } from "@/lib/time";
import { matchingService } from "@/domain/services/matching.service";
import { notificationService } from "@/domain/services/notification.service";

const hasAvailableSlot = (capacity: number, registeredCount: number, reservedCount: number) =>
  capacity - registeredCount - reservedCount > 0;

const activeEntryStates: WaitingEntryState[] = [
  WaitingEntryState.QUEUED,
  WaitingEntryState.PENDING_ADMIN,
  WaitingEntryState.OFFERED,
];

const toOfferMessage = (matchedPriority: number | null, sectionCode: string | null) => {
  if (matchedPriority === 1) {
    return `Admin da duyet de xuat uu tien 1 (${sectionCode ?? "lop bo sung"}). Vui long xac nhan lan cuoi trong 24 gio.`;
  }
  return `Uu tien 1 hien da het cho. Admin da duyet de xuat uu tien ${matchedPriority ?? "-"} (${sectionCode ?? "lop bo sung"}). Vui long xac nhan lan cuoi trong 24 gio.`;
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
        select: {
          id: true,
          code: true,
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
        reason: "He thong tu dong phe duyet de xuat qua SLA",
      },
    });

    await notificationService.create(entry.studentId, NotificationType.WAITING_OFFER, {
      title: "Da co de xuat lop tu phong cho",
      message: toOfferMessage(entry.matchedPriority, entry.offerSection?.code ?? null),
      waitingEntryId: entry.id,
      waitingRoomId: entry.waitingRoomId,
      sectionId: entry.offerSection?.id ?? null,
      sectionCode: entry.offerSection?.code ?? null,
      matchedPriority: entry.matchedPriority,
      expiresAt: expiresAt.toISOString(),
      requiresFinalConfirmation: true,
      autoApproved: true,
    });
  }

  return pendingEntries.length;
};

export const approvalService = {
  async manualApprove(waitingRoomId: string, approvedById: string, reason?: string) {
    const { approval, room, entries } = await prisma.$transaction(async (tx) => {
      const pending = await tx.approval.findFirst({
        where: { waitingRoomId, status: ApprovalStatus.PENDING },
        orderBy: { createdAt: "desc" },
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
        : await tx.approval.create({
            data: {
              waitingRoomId,
              status: ApprovalStatus.APPROVED,
              approvedById,
              reason: reason ?? "Phe duyet thu cong",
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
        await tx.section.update({
          where: { id: sectionId },
          data: {
            reservedCount: { decrement: count },
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
        title: "Phong cho da bi tu choi",
        message: reason,
        waitingRoomId,
      },
    );

    if (room) {
      await notificationService.createForAdmins(
        "SYSTEM",
        {
          title: "Da tu choi phong cho",
          message: `Phong cho hoc phan ${room.course.code} da bi tu choi.`,
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
            select: { id: true, code: true },
          },
        },
      });

      if (!target) {
        throw new Error("Khong tim thay waiting entry");
      }
      if (target.state !== WaitingEntryState.PENDING_ADMIN) {
        throw new Error("Chi co the duyet entry dang cho admin");
      }
      if (!target.offerSectionId) {
        throw new Error("Entry chua co lop de xep");
      }

      return tx.waitingEntry.update({
        where: { id: waitingEntryId },
        data: {
          state: WaitingEntryState.OFFERED,
          expiresAt,
          reason: reason ?? target.reason ?? "Admin da duyet de xuat",
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
            select: { id: true, code: true },
          },
        },
      });
    });

    await Promise.all([
      notificationService.create(entry.studentId, NotificationType.WAITING_OFFER, {
        title: "Admin da duyet de xuat phong cho",
        message: toOfferMessage(entry.matchedPriority, entry.offerSection?.code ?? null),
        waitingEntryId: entry.id,
        waitingRoomId: entry.waitingRoomId,
        sectionId: entry.offerSection?.id ?? null,
        sectionCode: entry.offerSection?.code ?? null,
        matchedPriority: entry.matchedPriority,
        expiresAt: expiresAt.toISOString(),
        requiresFinalConfirmation: true,
      }),
      notificationService.createForAdmins(
        NotificationType.SYSTEM,
        {
          title: "Da duyet de xuat cho sinh vien",
          message: `Entry ${entry.id} da duoc duyet va gui cho sinh vien xac nhan lan cuoi.`,
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
        throw new Error("Khong tim thay waiting entry");
      }
      if (target.state !== WaitingEntryState.PENDING_ADMIN) {
        throw new Error("Chi co the tu choi entry dang cho admin");
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
        await tx.section.update({
          where: { id: target.offerSectionId },
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
        title: "De xuat phong cho da bi tu choi",
        message: reason,
        waitingEntryId: entry.id,
        waitingRoomId: entry.waitingRoomId,
        sectionId: entry.offerSectionId,
      }),
      notificationService.createForAdmins(
        NotificationType.SYSTEM,
        {
          title: "Da tu choi de xuat cho sinh vien",
          message: `Entry ${entry.id} da bi tu choi. He thong se phan bo lai suat cho hang doi tiep theo.`,
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
      const canAutoApprove =
        sections.some((s) => hasAvailableSlot(s.capacity, s.registeredCount, s.reservedCount)) || sections.length > 0;

      if (canAutoApprove) {
        await prisma.approval.update({
          where: { id: approval.id },
          data: {
            status: ApprovalStatus.AUTO_APPROVED,
            reason: "Qua SLA 48h va he thong tu dong phe duyet",
          },
        });

        await notificationService.createForUsers(
          approval.waitingRoom.entries.map((entry) => entry.studentId),
          "SYSTEM",
          {
            title: "Phong cho duoc tu dong phe duyet",
            message:
              "Phong cho da qua SLA 48h nen he thong tu dong phe duyet va se tiep tuc xu ly de xuat lop.",
            waitingRoomId: approval.waitingRoomId,
            courseCode: approval.waitingRoom.course.code,
            requiresFinalConfirmation: true,
          },
        );

        const matchResult = await matchingService.matchWaitingRoom(approval.waitingRoomId);
        const autoOffered = await autoApprovePendingEntriesForRoom(approval.waitingRoomId);

        await notificationService.createForAdmins("SYSTEM", {
          title: "SLA tu dong phe duyet phong cho",
          message: `Hoc phan ${approval.waitingRoom.course.code}: ${autoOffered} de xuat da gui cho sinh vien xac nhan, ${matchResult.failed} chua phan duoc.`,
          waitingRoomId: approval.waitingRoomId,
          courseCode: approval.waitingRoom.course.code,
          autoOffered,
          pendingAdmin: matchResult.pendingAdmin,
          failed: matchResult.failed,
        });
        autoApproved += 1;
      } else {
        const reason = "Qua SLA 48h nhung khong con slot kha dung";
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
            await tx.section.update({
              where: { id: sectionId },
              data: {
                reservedCount: { decrement: count },
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
            title: "Phong cho bi tu choi do qua SLA",
            message: reason,
            waitingRoomId: approval.waitingRoomId,
            courseCode: approval.waitingRoom.course.code,
          },
        );
        await notificationService.createForAdmins("SYSTEM", {
          title: "SLA tu dong tu choi phong cho",
          message: `Hoc phan ${approval.waitingRoom.course.code} da bi tu choi vi khong con slot kha dung.`,
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

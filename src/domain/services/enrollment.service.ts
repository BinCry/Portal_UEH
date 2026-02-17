import { EnrollmentStatus, FinanceStatus, NotificationType, WaitingEntryState } from "@prisma/client";
import {
  TUITION_PER_CREDIT,
  WAITING_BLOCK_NEXT_SEMESTER_DAYS,
  WAITING_PRIORITY_PENALTY_DAYS,
} from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { addDaysFromNow, isExpired, now } from "@/lib/time";
import { hasScheduleConflict } from "@/domain/policies/schedule";
import { financeService } from "@/domain/services/finance.service";
import { matchingService } from "@/domain/services/matching.service";
import { notificationService } from "@/domain/services/notification.service";

const availableSlots = (capacity: number, registeredCount: number, reservedCount: number) =>
  capacity - registeredCount - reservedCount;

export const enrollmentService = {
  async directEnroll(studentId: string, sectionId: string) {
    return prisma.$transaction(async (tx) => {
      const studentProfile = await tx.studentProfile.findUnique({
        where: { userId: studentId },
        select: { faculty: true },
      });
      if (!studentProfile?.faculty) {
        throw new Error("Ban chua duoc gan nganh/chuong trinh dao tao");
      }

      const section = await tx.section.findUnique({
        where: { id: sectionId },
        include: {
          course: true,
          timeSlot: true,
        },
      });
      if (!section || section.status !== "OPEN") {
        throw new Error("LHP khong kha dung");
      }
      if (section.isWaitingOption) {
        throw new Error("Lop nay chi dung cho phong cho");
      }
      if (section.course.faculty !== studentProfile.faculty) {
        throw new Error("Ban chi duoc dang ky hoc phan thuoc nganh cua minh");
      }
      if (availableSlots(section.capacity, section.registeredCount, section.reservedCount) <= 0) {
        throw new Error("LHP da full");
      }

      const existing = await tx.enrollment.findMany({
        where: {
          studentId,
          status: EnrollmentStatus.ENROLLED,
        },
        include: {
          section: {
            include: {
              timeSlot: true,
            },
          },
        },
      });
      if (hasScheduleConflict(section, existing.map((x) => x.section))) {
        throw new Error("Trung lich hoc");
      }

      const enrollment = await tx.enrollment.create({
        data: {
          studentId,
          sectionId,
          status: EnrollmentStatus.ENROLLED,
        },
      });
      await tx.section.update({
        where: { id: sectionId },
        data: { registeredCount: { increment: 1 } },
      });

      const existingLedger = await tx.financeLedger.findFirst({
        where: {
          studentId,
          sectionId,
          status: {
            in: [FinanceStatus.PENDING, FinanceStatus.POSTED],
          },
        },
        orderBy: { createdAt: "desc" },
      });
      if (!existingLedger) {
        await tx.financeLedger.create({
          data: {
            studentId,
            courseId: section.courseId,
            sectionId,
            amount: section.course.credits * TUITION_PER_CREDIT,
            status: FinanceStatus.POSTED,
          },
        });
      }

      return enrollment;
    });
  },

  async confirmWaitingOffer(studentId: string, waitingEntryId: string) {
    const result = await prisma.$transaction(async (tx) => {
      const entry = await tx.waitingEntry.findUnique({
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
            include: {
              course: true,
            },
          },
        },
      });
      if (!entry || entry.studentId !== studentId) {
        throw new Error("Khong tim thay yeu cau");
      }
      if (entry.state !== WaitingEntryState.OFFERED) {
        throw new Error("Trang thai khong hop le");
      }
      if (isExpired(entry.expiresAt)) {
        throw new Error("Offer da het han");
      }
      if (!entry.offerSectionId) {
        throw new Error("Offer section khong hop le");
      }

      await tx.waitingEntry.update({
        where: { id: entry.id },
        data: {
          state: WaitingEntryState.CONFIRMED,
        },
      });
      await tx.section.update({
        where: { id: entry.offerSectionId },
        data: {
          reservedCount: { decrement: 1 },
          registeredCount: { increment: 1 },
        },
      });

      const enrollment = await tx.enrollment.upsert({
        where: {
          studentId_sectionId: {
            studentId,
            sectionId: entry.offerSectionId,
          },
        },
        update: {
          status: EnrollmentStatus.ENROLLED,
        },
        create: {
          studentId,
          sectionId: entry.offerSectionId,
          status: EnrollmentStatus.ENROLLED,
        },
      });

      return { enrollment, entry };
    });

    await financeService.createEnrollmentLedger(studentId, result.entry.offerSectionId!);

    await Promise.all([
      notificationService.create(studentId, "SYSTEM", {
        title: "Da xac nhan lop tu phong cho",
        message: "Ban da xac nhan lan cuoi thanh cong. Hoc phan da duoc ghi nhan vao hoc vu va tai chinh.",
        waitingEntryId: result.entry.id,
        waitingRoomId: result.entry.waitingRoomId,
        sectionId: result.entry.offerSectionId,
      }),
      notificationService.createForAdmins("SYSTEM", {
        title: "Sinh vien da xac nhan lop phong cho",
        message: `Sinh vien da xac nhan offer phong cho cho hoc phan ${result.entry.waitingRoom.course.code}.`,
        waitingEntryId: result.entry.id,
        waitingRoomId: result.entry.waitingRoomId,
        sectionId: result.entry.offerSectionId,
        studentId,
        courseCode: result.entry.waitingRoom.course.code,
        courseName: result.entry.waitingRoom.course.name,
      }),
    ]);

    return result;
  },

  async declineWaitingOffer(studentId: string, waitingEntryId: string) {
    const entry = await prisma.waitingEntry.findUnique({
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
    if (!entry || entry.studentId !== studentId) {
      throw new Error("Khong tim thay yeu cau");
    }
    if (entry.state !== WaitingEntryState.OFFERED) {
      throw new Error("Chi co the tu choi OFFERED");
    }

    const matchedPriority = entry.matchedPriority ?? 3;
    const isPriorityOneDecline = matchedPriority === 1;
    const blockedUntil = isPriorityOneDecline ? addDaysFromNow(WAITING_BLOCK_NEXT_SEMESTER_DAYS) : null;
    const priorityPenaltyUntil = !isPriorityOneDecline ? addDaysFromNow(WAITING_PRIORITY_PENALTY_DAYS) : null;

    await prisma.$transaction(async (tx) => {
      await tx.waitingEntry.update({
        where: { id: waitingEntryId },
        data: {
          state: WaitingEntryState.DECLINED,
          reason: isPriorityOneDecline
            ? "Sinh vien tu choi de xuat uu tien 1"
            : `Sinh vien tu choi de xuat uu tien ${matchedPriority}`,
        },
      });
      if (entry.offerSectionId) {
        await tx.section.update({
          where: { id: entry.offerSectionId },
          data: {
            reservedCount: { decrement: 1 },
          },
        });
      }

      if (isPriorityOneDecline && blockedUntil) {
        await tx.studentProfile.update({
          where: { userId: studentId },
          data: {
            waitingRoomBlockedUntil: blockedUntil,
          },
        });
      } else if (priorityPenaltyUntil) {
        await tx.studentProfile.update({
          where: { userId: studentId },
          data: {
            priorityPenaltyUntil,
          },
        });
      }
    });

    await Promise.all([
      notificationService.create(studentId, "SYSTEM", {
        title: isPriorityOneDecline
          ? "Canh bao: ban da tu choi de xuat uu tien 1"
          : "Ban da tu choi de xuat uu tien 2/3",
        message: isPriorityOneDecline
          ? `Ban se bi khoa quyen tham gia phong cho den ${blockedUntil?.toLocaleString("vi-VN")}.`
          : `Ban bi mat quyen uu tien tam thoi den ${priorityPenaltyUntil?.toLocaleString("vi-VN")}.`,
        waitingEntryId: entry.id,
        waitingRoomId: entry.waitingRoomId,
        matchedPriority,
        waitingRoomBlockedUntil: blockedUntil?.toISOString() ?? null,
        priorityPenaltyUntil: priorityPenaltyUntil?.toISOString() ?? null,
      }),
      notificationService.createForAdmins("SYSTEM", {
        title: "Sinh vien tu choi offer phong cho",
        message: isPriorityOneDecline
          ? `Sinh vien vua tu choi de xuat uu tien 1 cua hoc phan ${entry.waitingRoom.course.code}. Da khoa quyen phong cho hoc ky ke tiep.`
          : `Sinh vien vua tu choi de xuat uu tien ${matchedPriority} cua hoc phan ${entry.waitingRoom.course.code}. Da ap dung mat quyen uu tien tam thoi.`,
        waitingEntryId: entry.id,
        waitingRoomId: entry.waitingRoomId,
        studentId,
        courseCode: entry.waitingRoom.course.code,
        courseName: entry.waitingRoom.course.name,
        matchedPriority,
        waitingRoomBlockedUntil: blockedUntil?.toISOString() ?? null,
        priorityPenaltyUntil: priorityPenaltyUntil?.toISOString() ?? null,
      }),
    ]);

    await matchingService.matchWaitingRoom(entry.waitingRoomId);
  },

  async expireOfferedEntries() {
    const expiredEntries = await prisma.waitingEntry.findMany({
      where: {
        state: WaitingEntryState.OFFERED,
        expiresAt: {
          lte: now(),
        },
      },
      include: {
        waitingRoom: {
          include: {
            course: {
              select: { code: true },
            },
          },
        },
      },
    });

    const touchedRooms = new Set<string>();

    for (const entry of expiredEntries) {
      await prisma.$transaction(async (tx) => {
        await tx.waitingEntry.update({
          where: { id: entry.id },
          data: {
            state: WaitingEntryState.EXPIRED,
            reason: "Qua han xac nhan 24h",
          },
        });

        if (entry.offerSectionId) {
          await tx.section.update({
            where: { id: entry.offerSectionId },
            data: {
              reservedCount: { decrement: 1 },
            },
          });
        }
      });

      await notificationService.create(entry.studentId, NotificationType.WAITING_EXPIRED, {
        title: "Offer phong cho da het han",
        message: "Ban chua xac nhan lan cuoi trong 24 gio nen offer da het hieu luc.",
        waitingEntryId: entry.id,
        waitingRoomId: entry.waitingRoomId,
      });
      touchedRooms.add(entry.waitingRoomId);

      await matchingService.matchWaitingRoom(entry.waitingRoomId);
    }

    if (expiredEntries.length) {
      await notificationService.createForAdmins("SYSTEM", {
        title: "Co offer phong cho het han",
        message: `Co ${expiredEntries.length} offer da het han va he thong da tu dong chuyen suat cho hang doi tiep theo.`,
        expiredCount: expiredEntries.length,
        waitingRoomIds: [...touchedRooms],
      });
    }

    return { expiredCount: expiredEntries.length };
  },
};


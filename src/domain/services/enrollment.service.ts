import { EnrollmentStatus, NotificationType, Prisma, WaitingEntryState } from "@prisma/client";
import { WAITING_PRIORITY_PENALTY_DAYS } from "@/lib/constants";
import { DomainError } from "@/domain/errors/domain-error";
import { prisma } from "@/lib/prisma";
import { addDaysFromNow, isExpired, now } from "@/lib/time";
import { hasScheduleConflict } from "@/domain/policies/schedule";
import { assertNoActiveEnrollmentForCourse } from "@/domain/services/enrollment-guard.service";
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
        throw new Error("Bạn chưa được gán ngành/chương trình đào tạo");
      }

      const section = await tx.section.findUnique({
        where: { id: sectionId },
        include: {
          course: true,
          timeSlot: true,
        },
      });
      if (!section || section.status !== "OPEN") {
        throw new Error("Lớp học phần không khả dụng");
      }
      if (section.isWaitingOption) {
        throw new Error("Lớp này chỉ dùng cho phòng chờ");
      }
      if (section.course.faculty !== studentProfile.faculty) {
        throw new Error("Bạn chỉ được đăng ký học phần thuộc ngành của mình");
      }
      if (availableSlots(section.capacity, section.registeredCount, section.reservedCount) <= 0) {
        throw new Error("Lớp học phần đã đầy");
      }

      const existingBySection = await tx.enrollment.findUnique({
        where: {
          studentId_sectionId: {
            studentId,
            sectionId,
          },
        },
        select: {
          id: true,
          status: true,
        },
      });
      if (existingBySection?.status === EnrollmentStatus.ENROLLED) {
        throw new DomainError("ALREADY_ENROLLED_IN_COURSE", "Ban da dang ky hoc phan nay");
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
      if (
        hasScheduleConflict(
          section,
          existing.map((x) => x.section),
        )
      ) {
        throw new Error("Trùng lịch học");
      }

      await assertNoActiveEnrollmentForCourse({
        client: tx,
        studentId,
        courseId: section.courseId,
        excludeSectionId: sectionId,
      });

      let enrollment;
      if (existingBySection?.status === EnrollmentStatus.CANCELLED) {
        const revived = await tx.enrollment.updateMany({
          where: {
            studentId,
            sectionId,
            status: EnrollmentStatus.CANCELLED,
          },
          data: {
            status: EnrollmentStatus.ENROLLED,
            courseId: section.courseId,
          },
        });

        if (!revived.count) {
          const latest = await tx.enrollment.findUnique({
            where: {
              studentId_sectionId: {
                studentId,
                sectionId,
              },
            },
            select: { status: true },
          });
          if (latest?.status === EnrollmentStatus.ENROLLED) {
            throw new DomainError("ALREADY_ENROLLED_IN_COURSE", "Ban da dang ky hoc phan nay");
          }
          throw new Error("Học phần đang được xử lý, vui lòng thử lại");
        }

        enrollment = await tx.enrollment.findUnique({
          where: {
            studentId_sectionId: {
              studentId,
              sectionId,
            },
          },
        });
      } else {
        try {
          enrollment = await tx.enrollment.create({
            data: {
              studentId,
              courseId: section.courseId,
              sectionId,
              status: EnrollmentStatus.ENROLLED,
            },
          });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            throw new DomainError("ALREADY_ENROLLED_IN_COURSE", "Ban da dang ky hoc phan nay");
          }
          throw error;
        }
      }

      if (!enrollment) {
        throw new Error("Không thể tạo đăng ký học phần");
      }

      await tx.section.update({
        where: { id: sectionId },
        data: { registeredCount: { increment: 1 } },
      });

      await financeService.ensureEnrollmentLedger({
        client: tx,
        studentId,
        sectionId,
      });

      return enrollment;
    });
  },

  async cancelEnrollment(studentId: string, enrollmentId: string) {
    const result = await prisma.$transaction(async (tx) => {
      const enrollment = await tx.enrollment.findFirst({
        where: {
          id: enrollmentId,
          studentId,
        },
        include: {
          section: {
            include: {
              course: {
                select: {
                  code: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      if (!enrollment) {
        throw new Error("Không tìm thấy học phần đã đăng ký");
      }
      if (enrollment.status !== EnrollmentStatus.ENROLLED) {
        throw new Error("Học phần này đã được hủy trước đó");
      }

      const confirmedWaitingEntry = await tx.waitingEntry.findFirst({
        where: {
          studentId,
          offerSectionId: enrollment.sectionId,
          state: WaitingEntryState.CONFIRMED,
        },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          waitingRoomId: true,
        },
      });
      const source = confirmedWaitingEntry ? ("WAITING_ROOM" as const) : ("DIRECT" as const);

      const updatedEnrollment = await tx.enrollment.updateMany({
        where: {
          id: enrollmentId,
          studentId,
          status: EnrollmentStatus.ENROLLED,
        },
        data: {
          status: EnrollmentStatus.CANCELLED,
        },
      });
      if (!updatedEnrollment.count) {
        throw new Error("Học phần này đã được xử lý trước đó");
      }

      const updatedSection = await tx.section.updateMany({
        where: {
          id: enrollment.sectionId,
          registeredCount: {
            gt: 0,
          },
        },
        data: {
          registeredCount: {
            decrement: 1,
          },
        },
      });
      if (!updatedSection.count) {
        throw new Error("Không thể cập nhật sĩ số lớp học phần");
      }

      await financeService.voidEnrollmentLedgers({
        client: tx,
        studentId,
        sectionId: enrollment.sectionId,
      });

      const waitingRoom = await tx.waitingRoom.findUnique({
        where: { courseId: enrollment.section.courseId },
        select: { id: true, isActive: true },
      });

      return {
        enrollmentId: enrollment.id,
        sectionId: enrollment.sectionId,
        source,
        warningNextSemester: source === "WAITING_ROOM",
        waitingEntryId: confirmedWaitingEntry?.id ?? null,
        waitingRoomId: confirmedWaitingEntry?.waitingRoomId ?? null,
        sectionCode: enrollment.section.code,
        courseCode: enrollment.section.course.code,
        courseName: enrollment.section.course.name,
        courseWaitingRoomId: waitingRoom?.isActive ? waitingRoom.id : null,
      };
    });

    await Promise.all([
      notificationService.create(studentId, NotificationType.SYSTEM, {
        title: "Đã hủy học phần",
        message:
          result.source === "WAITING_ROOM"
            ? `Bạn đã hủy học phần ${result.courseCode}. Vui lòng cân nhắc trách nhiệm với lựa chọn phòng chờ ở kỳ sau.`
            : `Bạn đã hủy học phần ${result.courseCode} thành công.`,
        enrollmentId: result.enrollmentId,
        sectionId: result.sectionId,
        sectionCode: result.sectionCode,
        waitingEntryId: result.waitingEntryId,
        waitingRoomId: result.waitingRoomId,
        source: result.source,
        warningNextSemester: result.warningNextSemester,
      }),
      notificationService.createForAdmins(NotificationType.SYSTEM, {
        title: "Sinh viên đã hủy học phần",
        message:
          result.source === "WAITING_ROOM"
            ? `Sinh viên đã hủy học phần ${result.courseCode} (nguồn phòng chờ).`
            : `Sinh viên đã hủy học phần ${result.courseCode} (đăng ký trực tiếp).`,
        studentId,
        enrollmentId: result.enrollmentId,
        sectionId: result.sectionId,
        sectionCode: result.sectionCode,
        courseCode: result.courseCode,
        courseName: result.courseName,
        waitingEntryId: result.waitingEntryId,
        waitingRoomId: result.waitingRoomId,
        source: result.source,
        warningNextSemester: result.warningNextSemester,
      }),
    ]);

    if (result.courseWaitingRoomId) {
      await matchingService.matchWaitingRoom(result.courseWaitingRoomId);
    }

    return {
      enrollmentId: result.enrollmentId,
      sectionId: result.sectionId,
      source: result.source,
      warningNextSemester: result.warningNextSemester,
    };
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
        throw new DomainError("WAITING_STATE_CONFLICT", "Offer khong con hop le");
      }
      if (isExpired(entry.expiresAt)) {
        throw new Error("Offer da het han");
      }
      if (!entry.offerSectionId || !entry.offerSection) {
        throw new Error("Lop de xuat khong hop le");
      }

      await assertNoActiveEnrollmentForCourse({
        client: tx,
        studentId,
        courseId: entry.waitingRoom.courseId,
        excludeSectionId: entry.offerSectionId,
      });

      const updatedEntry = await tx.waitingEntry.updateMany({
        where: {
          id: entry.id,
          studentId,
          state: WaitingEntryState.OFFERED,
        },
        data: {
          state: WaitingEntryState.CONFIRMED,
        },
      });
      if (!updatedEntry.count) {
        throw new DomainError("WAITING_STATE_CONFLICT", "Offer da duoc xu ly");
      }

      const updatedSection = await tx.section.updateMany({
        where: {
          id: entry.offerSectionId,
          reservedCount: {
            gt: 0,
          },
        },
        data: {
          reservedCount: { decrement: 1 },
          registeredCount: { increment: 1 },
        },
      });
      if (!updatedSection.count) {
        throw new DomainError("WAITING_STATE_CONFLICT", "Khong the cap nhat giu cho cho offer");
      }

      let enrollment;
      try {
        enrollment = await tx.enrollment.upsert({
          where: {
            studentId_sectionId: {
              studentId,
              sectionId: entry.offerSectionId,
            },
          },
          update: {
            courseId: entry.waitingRoom.courseId,
            status: EnrollmentStatus.ENROLLED,
          },
          create: {
            studentId,
            courseId: entry.waitingRoom.courseId,
            sectionId: entry.offerSectionId,
            status: EnrollmentStatus.ENROLLED,
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new DomainError("ALREADY_ENROLLED_IN_COURSE", "Ban da dang ky hoc phan nay");
        }
        throw error;
      }

      await financeService.ensureEnrollmentLedger({
        client: tx,
        studentId,
        sectionId: entry.offerSectionId,
      });

      return { enrollment, entry };
    });

    await Promise.all([
      notificationService.create(studentId, "SYSTEM", {
        title: "Da xac nhan lop tu phong cho",
        message:
          "Ban da xac nhan lan cuoi thanh cong. Hoc phan da duoc ghi nhan vao hoc vu va tai chinh.",
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
      throw new DomainError("WAITING_STATE_CONFLICT", "Offer khong con hop le");
    }

    const matchedPriority = entry.matchedPriority ?? 3;
    const isPriorityOneDecline = matchedPriority === 1;
    const priorityPenaltyUntil = !isPriorityOneDecline
      ? addDaysFromNow(WAITING_PRIORITY_PENALTY_DAYS)
      : null;

    await prisma.$transaction(async (tx) => {
      const declined = await tx.waitingEntry.updateMany({
        where: {
          id: waitingEntryId,
          studentId,
          state: WaitingEntryState.OFFERED,
        },
        data: {
          state: WaitingEntryState.DECLINED,
          reason: isPriorityOneDecline
            ? "Sinh vien tu choi de xuat uu tien 1"
            : `Sinh vien tu choi de xuat uu tien ${matchedPriority}`,
        },
      });
      if (!declined.count) {
        throw new DomainError("WAITING_STATE_CONFLICT", "Offer da duoc xu ly");
      }

      if (entry.offerSectionId) {
        await tx.section.updateMany({
          where: {
            id: entry.offerSectionId,
            reservedCount: {
              gt: 0,
            },
          },
          data: {
            reservedCount: { decrement: 1 },
          },
        });
      }

      if (priorityPenaltyUntil) {
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
          ? "He thong ghi nhan: viec tu choi de xuat uu tien 1 co the anh huong den ket qua dang ky cua ban sau nay."
          : `Ban bi mat quyen uu tien tam thoi den ${priorityPenaltyUntil?.toLocaleString("vi-VN")}.`,
        waitingEntryId: entry.id,
        waitingRoomId: entry.waitingRoomId,
        matchedPriority,
        priorityPenaltyUntil: priorityPenaltyUntil?.toISOString() ?? null,
      }),
      notificationService.createForAdmins("SYSTEM", {
        title: "Sinh vien tu choi offer phong cho",
        message: isPriorityOneDecline
          ? `Sinh vien vua tu choi de xuat uu tien 1 cua hoc phan ${entry.waitingRoom.course.code}. Da ghi nhan canh bao vi pham.`
          : `Sinh vien vua tu choi de xuat uu tien ${matchedPriority} cua hoc phan ${entry.waitingRoom.course.code}. Da ap dung mat quyen uu tien tam thoi.`,
        waitingEntryId: entry.id,
        waitingRoomId: entry.waitingRoomId,
        studentId,
        courseCode: entry.waitingRoom.course.code,
        courseName: entry.waitingRoom.course.name,
        matchedPriority,
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
    let expiredCount = 0;

    for (const entry of expiredEntries) {
      const processed = await prisma.$transaction(async (tx) => {
        const updated = await tx.waitingEntry.updateMany({
          where: {
            id: entry.id,
            state: WaitingEntryState.OFFERED,
          },
          data: {
            state: WaitingEntryState.EXPIRED,
            reason: "Qua han xac nhan 24h",
          },
        });
        if (!updated.count) {
          return false;
        }

        if (entry.offerSectionId) {
          await tx.section.updateMany({
            where: {
              id: entry.offerSectionId,
              reservedCount: {
                gt: 0,
              },
            },
            data: {
              reservedCount: { decrement: 1 },
            },
          });
        }

        return true;
      });

      if (!processed) {
        continue;
      }

      expiredCount += 1;

      await notificationService.create(entry.studentId, NotificationType.WAITING_EXPIRED, {
        title: "Offer phong cho da het han",
        message: "Ban chua xac nhan lan cuoi trong 24 gio nen offer da het hieu luc.",
        waitingEntryId: entry.id,
        waitingRoomId: entry.waitingRoomId,
      });
      touchedRooms.add(entry.waitingRoomId);

      await matchingService.matchWaitingRoom(entry.waitingRoomId);
    }

    if (expiredCount) {
      await notificationService.createForAdmins("SYSTEM", {
        title: "Co offer phong cho het han",
        message: `Co ${expiredCount} offer da het han va he thong da tu dong chuyen suat cho hang doi tiep theo.`,
        expiredCount,
        waitingRoomIds: [...touchedRooms],
      });
    }

    return { expiredCount };
  },
};

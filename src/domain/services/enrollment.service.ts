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
        throw new DomainError("ALREADY_ENROLLED_IN_COURSE", "Bạn đã đăng ký học phần này");
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
            throw new DomainError("ALREADY_ENROLLED_IN_COURSE", "Bạn đã đăng ký học phần này");
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
            throw new DomainError("ALREADY_ENROLLED_IN_COURSE", "Bạn đã đăng ký học phần này");
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
        throw new Error("Không tìm thấy yêu cầu");
      }
      if (entry.state !== WaitingEntryState.OFFERED) {
        throw new DomainError("WAITING_STATE_CONFLICT", "Offer không còn hợp lệ");
      }
      if (isExpired(entry.expiresAt)) {
        throw new Error("Offer đã hết hạn");
      }
      if (!entry.offerSectionId || !entry.offerSection) {
        throw new Error("Lớp đề xuất không hợp lệ");
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
        throw new DomainError("WAITING_STATE_CONFLICT", "Offer đã được xử lý");
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
        throw new DomainError("WAITING_STATE_CONFLICT", "Không thể cập nhật giữ chỗ cho offer");
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
          throw new DomainError("ALREADY_ENROLLED_IN_COURSE", "Bạn đã đăng ký học phần này");
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
        title: "Đã xác nhận lớp từ phòng chờ",
        message:
          "Bạn đã xác nhận lần cuối thành công. Học phần đã được ghi nhận vào học vụ và tài chính.",
        waitingEntryId: result.entry.id,
        waitingRoomId: result.entry.waitingRoomId,
        sectionId: result.entry.offerSectionId,
      }),
      notificationService.createForAdmins("SYSTEM", {
        title: "Sinh viên đã xác nhận lớp phòng chờ",
        message: `Sinh viên đã xác nhận offer phòng chờ cho học phần ${result.entry.waitingRoom.course.code}.`,
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
      throw new Error("Không tìm thấy yêu cầu");
    }
    if (entry.state !== WaitingEntryState.OFFERED) {
      throw new DomainError("WAITING_STATE_CONFLICT", "Offer không còn hợp lệ");
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
            ? "Sinh viên từ chối đề xuất ưu tiên 1"
            : `Sinh viên từ chối đề xuất ưu tiên ${matchedPriority}`,
        },
      });
      if (!declined.count) {
        throw new DomainError("WAITING_STATE_CONFLICT", "Offer đã được xử lý");
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
          ? "Cảnh báo: bạn đã từ chối đề xuất ưu tiên 1"
          : "Bạn đã từ chối đề xuất ưu tiên 2/3",
        message: isPriorityOneDecline
          ? "Hệ thống ghi nhận: việc từ chối đề xuất ưu tiên 1 có thể ảnh hưởng đến kết quả đăng ký của bạn sau này."
          : `Bạn bị mất quyền ưu tiên tạm thời đến ${priorityPenaltyUntil?.toLocaleString("vi-VN")}.`,
        waitingEntryId: entry.id,
        waitingRoomId: entry.waitingRoomId,
        matchedPriority,
        priorityPenaltyUntil: priorityPenaltyUntil?.toISOString() ?? null,
      }),
      notificationService.createForAdmins("SYSTEM", {
        title: "Sinh viên từ chối offer phòng chờ",
        message: isPriorityOneDecline
          ? `Sinh viên vừa từ chối đề xuất ưu tiên 1 của học phần ${entry.waitingRoom.course.code}. Đã ghi nhận cảnh báo vi phạm.`
          : `Sinh viên vừa từ chối đề xuất ưu tiên ${matchedPriority} của học phần ${entry.waitingRoom.course.code}. Đã áp dụng mất quyền ưu tiên tạm thời.`,
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
            reason: "Quá hạn xác nhận 24h",
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
        title: "Offer phòng chờ đã hết hạn",
        message: "Bạn chưa xác nhận lần cuối trong 24 giờ nên offer đã hết hiệu lực.",
        waitingEntryId: entry.id,
        waitingRoomId: entry.waitingRoomId,
      });
      touchedRooms.add(entry.waitingRoomId);

      await matchingService.matchWaitingRoom(entry.waitingRoomId);
    }

    if (expiredCount) {
      await notificationService.createForAdmins("SYSTEM", {
        title: "Có offer phòng chờ hết hạn",
        message: `Có ${expiredCount} offer đã hết hạn và hệ thống đã tự động chuyển suất cho hàng đợi tiếp theo.`,
        expiredCount,
        waitingRoomIds: [...touchedRooms],
      });
    }

    return { expiredCount };
  },
};

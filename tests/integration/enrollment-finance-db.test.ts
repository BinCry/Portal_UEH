import { EnrollmentStatus, FinanceStatus, WaitingEntryState } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enrollmentService } from "@/domain/services/enrollment.service";
import { matchingService } from "@/domain/services/matching.service";
import { notificationService } from "@/domain/services/notification.service";
import { prisma } from "@/lib/prisma";
import { createTestDbContext, makePrefix } from "../support/db-fixtures";

describe.sequential("Enrollment finance DB flows", () => {
  let ctx = createTestDbContext(makePrefix("enrollment-db"));

  beforeEach(() => {
    ctx = createTestDbContext(makePrefix("enrollment-db"));
    vi.spyOn(notificationService, "create").mockResolvedValue({ id: "notification" } as never);
    vi.spyOn(notificationService, "createForAdmins").mockResolvedValue({ count: 0 } as never);
    vi.spyOn(matchingService, "matchWaitingRoom").mockResolvedValue({
      totalQueued: 0,
      pendingAdmin: 0,
      failed: 0,
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await ctx.cleanup();
  });

  it("direct enroll creates one active enrollment, increments section count, and creates one active ledger", async () => {
    const student = await ctx.createStudentAccount();
    const course = await ctx.createCourse();
    const room = await ctx.createRoom();
    const timeSlot = await ctx.createTimeSlot();
    const section = await ctx.createSection({
      courseId: course.id,
      roomId: room.id,
      timeSlotId: timeSlot.id,
      capacity: 5,
    });

    await enrollmentService.directEnroll(student.id, section.id);

    const [enrollment, refreshedSection, activeLedgers] = await Promise.all([
      prisma.enrollment.findUnique({
        where: {
          studentId_sectionId: {
            studentId: student.id,
            sectionId: section.id,
          },
        },
      }),
      prisma.section.findUnique({
        where: { id: section.id },
      }),
      prisma.financeLedger.findMany({
        where: {
          studentId: student.id,
          sectionId: section.id,
          status: FinanceStatus.POSTED,
        },
      }),
    ]);

    expect(enrollment?.status).toBe(EnrollmentStatus.ENROLLED);
    expect(enrollment?.courseId).toBe(course.id);
    expect(refreshedSection?.registeredCount).toBe(1);
    expect(activeLedgers).toHaveLength(1);
  });

  it("cancel enrollment marks enrollment VOID in finance and decrements section count", async () => {
    const student = await ctx.createStudentAccount();
    const course = await ctx.createCourse();
    const room = await ctx.createRoom();
    const timeSlot = await ctx.createTimeSlot();
    const section = await ctx.createSection({
      courseId: course.id,
      roomId: room.id,
      timeSlotId: timeSlot.id,
      capacity: 5,
    });

    const enrollment = await enrollmentService.directEnroll(student.id, section.id);
    const result = await enrollmentService.cancelEnrollment(student.id, enrollment.id);

    const [cancelledEnrollment, refreshedSection, ledgers] = await Promise.all([
      prisma.enrollment.findUnique({
        where: { id: enrollment.id },
      }),
      prisma.section.findUnique({
        where: { id: section.id },
      }),
      prisma.financeLedger.findMany({
        where: {
          studentId: student.id,
          sectionId: section.id,
        },
        orderBy: {
          createdAt: "asc",
        },
      }),
    ]);

    expect(result.warningNextSemester).toBe(false);
    expect(cancelledEnrollment?.status).toBe(EnrollmentStatus.CANCELLED);
    expect(refreshedSection?.registeredCount).toBe(0);
    expect(ledgers).toHaveLength(1);
    expect(ledgers[0]?.status).toBe(FinanceStatus.VOID);
  });

  it("re-enroll after cancel recreates exactly one active ledger", async () => {
    const student = await ctx.createStudentAccount();
    const course = await ctx.createCourse();
    const room = await ctx.createRoom();
    const timeSlot = await ctx.createTimeSlot();
    const section = await ctx.createSection({
      courseId: course.id,
      roomId: room.id,
      timeSlotId: timeSlot.id,
      capacity: 5,
    });

    const firstEnrollment = await enrollmentService.directEnroll(student.id, section.id);
    await enrollmentService.cancelEnrollment(student.id, firstEnrollment.id);
    await enrollmentService.directEnroll(student.id, section.id);

    const ledgers = await prisma.financeLedger.findMany({
      where: {
        studentId: student.id,
        sectionId: section.id,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    expect(ledgers).toHaveLength(2);
    expect(ledgers.filter((item) => item.status === FinanceStatus.POSTED)).toHaveLength(1);
    expect(ledgers.filter((item) => item.status === FinanceStatus.VOID)).toHaveLength(1);
  });

  it("confirm waiting offer creates enrollment, consumes reserve, and creates one active ledger", async () => {
    const student = await ctx.createStudentAccount();
    const course = await ctx.createCourse();
    const room = await ctx.createRoom();
    const timeSlot = await ctx.createTimeSlot();
    const section = await ctx.createSection({
      courseId: course.id,
      roomId: room.id,
      timeSlotId: timeSlot.id,
      capacity: 5,
      reservedCount: 1,
      isWaitingOption: true,
    });
    const waitingRoom = await ctx.createWaitingRoom({
      courseId: course.id,
    });
    const waitingEntry = await ctx.createWaitingEntry({
      waitingRoomId: waitingRoom.id,
      studentId: student.id,
      state: WaitingEntryState.OFFERED,
      offerSectionId: section.id,
      matchedPriority: 1,
    });

    await enrollmentService.confirmWaitingOffer(student.id, waitingEntry.id);

    const [confirmedEntry, enrollment, refreshedSection, activeLedgers] = await Promise.all([
      prisma.waitingEntry.findUnique({
        where: { id: waitingEntry.id },
      }),
      prisma.enrollment.findUnique({
        where: {
          studentId_sectionId: {
            studentId: student.id,
            sectionId: section.id,
          },
        },
      }),
      prisma.section.findUnique({
        where: { id: section.id },
      }),
      prisma.financeLedger.findMany({
        where: {
          studentId: student.id,
          sectionId: section.id,
          status: FinanceStatus.POSTED,
        },
      }),
    ]);

    expect(confirmedEntry?.state).toBe(WaitingEntryState.CONFIRMED);
    expect(enrollment?.status).toBe(EnrollmentStatus.ENROLLED);
    expect(refreshedSection?.registeredCount).toBe(1);
    expect(refreshedSection?.reservedCount).toBe(0);
    expect(activeLedgers).toHaveLength(1);
  });

  it("cancel waiting-confirmed enrollment voids finance and returns waiting-room warning", async () => {
    const student = await ctx.createStudentAccount();
    const course = await ctx.createCourse();
    const room = await ctx.createRoom();
    const timeSlot = await ctx.createTimeSlot();
    const section = await ctx.createSection({
      courseId: course.id,
      roomId: room.id,
      timeSlotId: timeSlot.id,
      capacity: 5,
      reservedCount: 1,
      isWaitingOption: true,
    });
    const waitingRoom = await ctx.createWaitingRoom({
      courseId: course.id,
    });
    const waitingEntry = await ctx.createWaitingEntry({
      waitingRoomId: waitingRoom.id,
      studentId: student.id,
      state: WaitingEntryState.OFFERED,
      offerSectionId: section.id,
      matchedPriority: 1,
    });

    const confirmed = await enrollmentService.confirmWaitingOffer(student.id, waitingEntry.id);
    const result = await enrollmentService.cancelEnrollment(student.id, confirmed.enrollment.id);

    const activeLedgers = await prisma.financeLedger.findMany({
      where: {
        studentId: student.id,
        sectionId: section.id,
        status: FinanceStatus.POSTED,
      },
    });
    const voidLedgers = await prisma.financeLedger.findMany({
      where: {
        studentId: student.id,
        sectionId: section.id,
        status: FinanceStatus.VOID,
      },
    });

    expect(result.warningNextSemester).toBe(true);
    expect(activeLedgers).toHaveLength(0);
    expect(voidLedgers).toHaveLength(1);
  });
});

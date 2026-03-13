import { EnrollmentStatus, WaitingEntryState } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { approvalService } from "@/domain/services/approval-service";
import { enrollmentService } from "@/domain/services/enrollment.service";
import { matchingService } from "@/domain/services/matching.service";
import { notificationService } from "@/domain/services/notification.service";
import { studentEnrollmentHistoryService } from "@/domain/services/student-enrollment-history.service";
import { createTestDbContext, makePrefix } from "../support/db-fixtures";

describe.sequential("Student enrollment history read model", () => {
  let ctx = createTestDbContext(makePrefix("student-history"));

  beforeEach(() => {
    ctx = createTestDbContext(makePrefix("student-history"));
    vi.spyOn(notificationService, "create").mockResolvedValue({ id: "notification" } as never);
    vi.spyOn(notificationService, "createForAdmins").mockResolvedValue({ count: 0 } as never);
    vi.spyOn(notificationService, "createForUsers").mockResolvedValue({ count: 0 } as never);
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

  it("returns section participant counts for direct enrollments", async () => {
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

    const history = await studentEnrollmentHistoryService.getForStudent(student.id);

    expect(history).toHaveLength(1);
    expect(history[0]?.source).toBe("DIRECT");
    expect(history[0]?.participantScope).toBe("SECTION");
    expect(history[0]?.participantCount).toBe(1);
  });

  it("returns waiting-flow participant counts for waiting-room enrollments", async () => {
    const student = await ctx.createStudentAccount();
    const queuedStudent = await ctx.createStudentAccount({ email: `${ctx.prefix}-queued@ueh.edu.vn` });
    const pendingStudent = await ctx.createStudentAccount({ email: `${ctx.prefix}-pending@ueh.edu.vn` });
    const offeredStudent = await ctx.createStudentAccount({ email: `${ctx.prefix}-offered@ueh.edu.vn` });
    const course = await ctx.createCourse();
    const room = await ctx.createRoom();
    const timeSlot = await ctx.createTimeSlot();
    const waitingSection = await ctx.createSection({
      courseId: course.id,
      roomId: room.id,
      timeSlotId: timeSlot.id,
      capacity: 5,
      registeredCount: 1,
      isWaitingOption: true,
    });
    const waitingRoom = await ctx.createWaitingRoom({ courseId: course.id });

    await ctx.createWaitingEntry({
      waitingRoomId: waitingRoom.id,
      studentId: student.id,
      state: WaitingEntryState.CONFIRMED,
      offerSectionId: waitingSection.id,
      matchedPriority: 1,
      expiresAt: null,
    });
    await ctx.createEnrollment({
      studentId: student.id,
      courseId: course.id,
      sectionId: waitingSection.id,
      status: EnrollmentStatus.ENROLLED,
    });
    await ctx.createWaitingEntry({
      waitingRoomId: waitingRoom.id,
      studentId: queuedStudent.id,
      state: WaitingEntryState.QUEUED,
      offerSectionId: null,
      prioritiesJson: [{ sectionId: waitingSection.id }],
      expiresAt: null,
    });
    await ctx.createWaitingEntry({
      waitingRoomId: waitingRoom.id,
      studentId: pendingStudent.id,
      state: WaitingEntryState.PENDING_ADMIN,
      offerSectionId: waitingSection.id,
      matchedPriority: 1,
      expiresAt: null,
    });
    await ctx.createWaitingEntry({
      waitingRoomId: waitingRoom.id,
      studentId: offeredStudent.id,
      state: WaitingEntryState.OFFERED,
      offerSectionId: waitingSection.id,
      matchedPriority: 1,
    });

    const history = await studentEnrollmentHistoryService.getForStudent(student.id);

    expect(history).toHaveLength(1);
    expect(history[0]?.source).toBe("WAITING_ROOM");
    expect(history[0]?.participantScope).toBe("WAITING_FLOW");
    expect(history[0]?.participantCount).toBe(4);
  });

  it("drops waiting-flow participant count after admin rejects a pending entry", async () => {
    const admin = await ctx.createAdminAccount();
    const observer = await ctx.createStudentAccount();
    const pendingStudent = await ctx.createStudentAccount({ email: `${ctx.prefix}-pending@ueh.edu.vn` });
    const course = await ctx.createCourse();
    const room = await ctx.createRoom();
    const timeSlot = await ctx.createTimeSlot();
    const waitingSection = await ctx.createSection({
      courseId: course.id,
      roomId: room.id,
      timeSlotId: timeSlot.id,
      capacity: 5,
      registeredCount: 1,
      reservedCount: 1,
      isWaitingOption: true,
    });
    const waitingRoom = await ctx.createWaitingRoom({ courseId: course.id });

    await ctx.createWaitingEntry({
      waitingRoomId: waitingRoom.id,
      studentId: observer.id,
      state: WaitingEntryState.CONFIRMED,
      offerSectionId: waitingSection.id,
      matchedPriority: 1,
      expiresAt: null,
    });
    await ctx.createEnrollment({
      studentId: observer.id,
      courseId: course.id,
      sectionId: waitingSection.id,
      status: EnrollmentStatus.ENROLLED,
    });
    const pendingEntry = await ctx.createWaitingEntry({
      waitingRoomId: waitingRoom.id,
      studentId: pendingStudent.id,
      state: WaitingEntryState.PENDING_ADMIN,
      offerSectionId: waitingSection.id,
      matchedPriority: 1,
      expiresAt: null,
    });

    const before = await studentEnrollmentHistoryService.getForStudent(observer.id);
    await approvalService.rejectEntry(pendingEntry.id, admin.id, "Reject pending entry");
    const after = await studentEnrollmentHistoryService.getForStudent(observer.id);

    expect(before[0]?.participantCount).toBe(2);
    expect(after[0]?.participantCount).toBe(1);
  });

  it("drops waiting-flow participant count after a waiting-confirmed enrollment is canceled", async () => {
    const observer = await ctx.createStudentAccount();
    const cancelledStudent = await ctx.createStudentAccount({ email: `${ctx.prefix}-cancelled@ueh.edu.vn` });
    const course = await ctx.createCourse();
    const room = await ctx.createRoom();
    const timeSlot = await ctx.createTimeSlot();
    const waitingSection = await ctx.createSection({
      courseId: course.id,
      roomId: room.id,
      timeSlotId: timeSlot.id,
      capacity: 5,
      registeredCount: 2,
      isWaitingOption: true,
    });
    const waitingRoom = await ctx.createWaitingRoom({ courseId: course.id });

    await ctx.createWaitingEntry({
      waitingRoomId: waitingRoom.id,
      studentId: observer.id,
      state: WaitingEntryState.CONFIRMED,
      offerSectionId: waitingSection.id,
      matchedPriority: 1,
      expiresAt: null,
    });
    await ctx.createEnrollment({
      studentId: observer.id,
      courseId: course.id,
      sectionId: waitingSection.id,
      status: EnrollmentStatus.ENROLLED,
    });
    await ctx.createWaitingEntry({
      waitingRoomId: waitingRoom.id,
      studentId: cancelledStudent.id,
      state: WaitingEntryState.CONFIRMED,
      offerSectionId: waitingSection.id,
      matchedPriority: 1,
      expiresAt: null,
    });
    const cancelledEnrollment = await ctx.createEnrollment({
      studentId: cancelledStudent.id,
      courseId: course.id,
      sectionId: waitingSection.id,
      status: EnrollmentStatus.ENROLLED,
    });

    const before = await studentEnrollmentHistoryService.getForStudent(observer.id);
    await enrollmentService.cancelEnrollment(cancelledStudent.id, cancelledEnrollment.id);
    const after = await studentEnrollmentHistoryService.getForStudent(observer.id);

    expect(before[0]?.participantCount).toBe(2);
    expect(after[0]?.participantCount).toBe(1);
  });
});

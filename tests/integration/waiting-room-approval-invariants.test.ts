import { ApprovalStatus, WaitingEntryState } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { approvalService } from "@/domain/services/approval-service";
import { matchingService } from "@/domain/services/matching.service";
import { notificationService } from "@/domain/services/notification.service";
import { waitingEntryService } from "@/domain/services/waiting-entry.service";
import { historyCleanupService } from "@/domain/services/history-cleanup.service";
import { prisma } from "@/lib/prisma";
import { createTestDbContext, makePrefix } from "../support/db-fixtures";

describe.sequential("Waiting room approval invariants", () => {
  let ctx = createTestDbContext(makePrefix("waiting-approval"));

  beforeEach(() => {
    ctx = createTestDbContext(makePrefix("waiting-approval"));
    vi.spyOn(notificationService, "create").mockResolvedValue({ id: "notification" } as never);
    vi.spyOn(notificationService, "createForAdmins").mockResolvedValue({ count: 0 } as never);
    vi.spyOn(notificationService, "createForUsers").mockResolvedValue({ count: 0 } as never);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await ctx.cleanup();
  });

  it("does not match queued entries while the waiting room is still pending review", async () => {
    const student = await ctx.createStudentAccount();
    const course = await ctx.createCourse({ code: `CRS-${ctx.token}-PR` });
    const room = await ctx.createRoom();
    const timeSlot = await ctx.createTimeSlot();
    const waitingSection = await ctx.createSection({
      courseId: course.id,
      roomId: room.id,
      timeSlotId: timeSlot.id,
      code: `SEC-${ctx.token}-PR`,
      isWaitingOption: true,
      capacity: 5,
    });
    const waitingRoom = await ctx.createWaitingRoom({ courseId: course.id });
    await ctx.createApproval({
      waitingRoomId: waitingRoom.id,
      status: ApprovalStatus.PENDING,
    });
    const entry = await ctx.createWaitingEntry({
      waitingRoomId: waitingRoom.id,
      studentId: student.id,
      state: WaitingEntryState.QUEUED,
      offerSectionId: null,
      prioritiesJson: [{ sectionId: waitingSection.id }],
      matchedPriority: null,
      expiresAt: null,
    });

    const result = await matchingService.matchWaitingRoom(waitingRoom.id);

    const [reloadedEntry, reloadedSection] = await Promise.all([
      prisma.waitingEntry.findUnique({ where: { id: entry.id } }),
      prisma.section.findUnique({ where: { id: waitingSection.id } }),
    ]);

    expect(result.totalQueued).toBe(1);
    expect(result.pendingAdmin).toBe(0);
    expect(result.failed).toBe(0);
    expect(reloadedEntry?.state).toBe(WaitingEntryState.QUEUED);
    expect(reloadedSection?.reservedCount).toBe(0);
  });

  it("manual room approval recovers an orphan active room and advances queued entries", async () => {
    const admin = await ctx.createAdminAccount();
    const student = await ctx.createStudentAccount();
    const course = await ctx.createCourse({ code: `CRS-${ctx.token}-ORPHAN` });
    const room = await ctx.createRoom();
    const timeSlot = await ctx.createTimeSlot();
    const waitingSection = await ctx.createSection({
      courseId: course.id,
      roomId: room.id,
      timeSlotId: timeSlot.id,
      code: `SEC-${ctx.token}-ORPHAN`,
      isWaitingOption: true,
      capacity: 5,
    });
    const waitingRoom = await ctx.createWaitingRoom({ courseId: course.id });
    const queuedEntry = await ctx.createWaitingEntry({
      waitingRoomId: waitingRoom.id,
      studentId: student.id,
      state: WaitingEntryState.QUEUED,
      offerSectionId: null,
      prioritiesJson: [{ sectionId: waitingSection.id }],
      matchedPriority: null,
      expiresAt: null,
    });

    const approval = await approvalService.manualApprove(
      waitingRoom.id,
      admin.id,
      "Recover orphan room",
    );

    const [approvals, entry, section] = await Promise.all([
      prisma.approval.findMany({
        where: { waitingRoomId: waitingRoom.id },
        orderBy: { createdAt: "asc" },
      }),
      prisma.waitingEntry.findUnique({ where: { id: queuedEntry.id } }),
      prisma.section.findUnique({ where: { id: waitingSection.id } }),
    ]);

    expect(approval.status).toBe(ApprovalStatus.APPROVED);
    expect(approvals).toHaveLength(1);
    expect(entry?.state).toBe(WaitingEntryState.PENDING_ADMIN);
    expect(entry?.offerSectionId).toBe(waitingSection.id);
    expect(section?.reservedCount).toBe(1);
  });

  it("joining an approved waiting room immediately advances the student to pending-admin when a slot exists", async () => {
    const student = await ctx.createStudentAccount();
    const course = await ctx.createCourse({ code: `CRS-${ctx.token}-JOIN` });
    const room = await ctx.createRoom();
    const timeSlot = await ctx.createTimeSlot();
    await ctx.createSection({
      courseId: course.id,
      roomId: room.id,
      timeSlotId: timeSlot.id,
      code: `SEC-${ctx.token}-MAIN`,
      capacity: 5,
      registeredCount: 0,
      isWaitingOption: false,
    });
    const waitingSection = await ctx.createSection({
      courseId: course.id,
      roomId: room.id,
      timeSlotId: timeSlot.id,
      code: `SEC-${ctx.token}-JOIN`,
      isWaitingOption: true,
      capacity: 5,
    });
    const waitingRoom = await ctx.createWaitingRoom({ courseId: course.id });
    await ctx.createApproval({
      waitingRoomId: waitingRoom.id,
      status: ApprovalStatus.APPROVED,
    });

    const result = await waitingEntryService.join({
      courseId: course.id,
      studentId: student.id,
      acceptedTerms: true,
      priorities: [{ sectionId: waitingSection.id }],
    });

    const [entry, section] = await Promise.all([
      prisma.waitingEntry.findUnique({ where: { id: result.entry.id } }),
      prisma.section.findUnique({ where: { id: waitingSection.id } }),
    ]);

    expect(entry?.state).toBe(WaitingEntryState.PENDING_ADMIN);
    expect(entry?.offerSectionId).toBe(waitingSection.id);
    expect(section?.reservedCount).toBe(1);
  });

  it("rejecting a pending-admin entry releases the slot and rematches the next queued student", async () => {
    const admin = await ctx.createAdminAccount();
    const currentStudent = await ctx.createStudentAccount({
      email: `${ctx.prefix}-current@ueh.edu.vn`,
    });
    const nextStudent = await ctx.createStudentAccount({ email: `${ctx.prefix}-next@ueh.edu.vn` });
    const course = await ctx.createCourse({ code: `CRS-${ctx.token}-RETRY` });
    const room = await ctx.createRoom();
    const timeSlot = await ctx.createTimeSlot();
    const waitingSection = await ctx.createSection({
      courseId: course.id,
      roomId: room.id,
      timeSlotId: timeSlot.id,
      code: `SEC-${ctx.token}-RETRY`,
      isWaitingOption: true,
      capacity: 5,
      reservedCount: 1,
    });
    const waitingRoom = await ctx.createWaitingRoom({ courseId: course.id });
    await ctx.createApproval({
      waitingRoomId: waitingRoom.id,
      status: ApprovalStatus.APPROVED,
      approvedById: admin.id,
    });
    const pendingEntry = await ctx.createWaitingEntry({
      waitingRoomId: waitingRoom.id,
      studentId: currentStudent.id,
      state: WaitingEntryState.PENDING_ADMIN,
      offerSectionId: waitingSection.id,
      prioritiesJson: [{ sectionId: waitingSection.id }],
      matchedPriority: 1,
      expiresAt: null,
    });
    const queuedEntry = await ctx.createWaitingEntry({
      waitingRoomId: waitingRoom.id,
      studentId: nextStudent.id,
      state: WaitingEntryState.QUEUED,
      offerSectionId: null,
      prioritiesJson: [{ sectionId: waitingSection.id }],
      matchedPriority: null,
      expiresAt: null,
    });

    await approvalService.rejectEntry(pendingEntry.id, admin.id, "Retry another student");

    const [rejectedEntry, rematchedEntry, section] = await Promise.all([
      prisma.waitingEntry.findUnique({ where: { id: pendingEntry.id } }),
      prisma.waitingEntry.findUnique({ where: { id: queuedEntry.id } }),
      prisma.section.findUnique({ where: { id: waitingSection.id } }),
    ]);

    expect(rejectedEntry?.state).toBe(WaitingEntryState.DEFERRED);
    expect(rematchedEntry?.state).toBe(WaitingEntryState.PENDING_ADMIN);
    expect(rematchedEntry?.offerSectionId).toBe(waitingSection.id);
    expect(section?.reservedCount).toBe(1);
  });

  it("cleanup keeps the latest approval anchor and preserves approvals for active rooms", async () => {
    const activeCourse = await ctx.createCourse({ code: `CRS-${ctx.token}-ACTIVE` });
    const inactiveCourse = await ctx.createCourse({ code: `CRS-${ctx.token}-INACTIVE` });
    const activeRoom = await ctx.createWaitingRoom({ courseId: activeCourse.id, isActive: true });
    const inactiveRoom = await ctx.createWaitingRoom({
      courseId: inactiveCourse.id,
      isActive: false,
    });
    const activeApproval = await ctx.createApproval({
      waitingRoomId: activeRoom.id,
      status: ApprovalStatus.APPROVED,
      reason: "Active room approval",
    });
    const oldInactiveApproval = await ctx.createApproval({
      waitingRoomId: inactiveRoom.id,
      status: ApprovalStatus.APPROVED,
      reason: "Old approval",
    });
    const latestInactiveApproval = await ctx.createApproval({
      waitingRoomId: inactiveRoom.id,
      status: ApprovalStatus.REJECTED,
      reason: "Latest approval",
    });

    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const newerOldDate = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000);
    await Promise.all([
      prisma.$executeRaw`UPDATE "Approval" SET "createdAt" = ${oldDate}, "updatedAt" = ${oldDate} WHERE id = ${activeApproval.id}`,
      prisma.$executeRaw`UPDATE "Approval" SET "createdAt" = ${oldDate}, "updatedAt" = ${oldDate} WHERE id = ${oldInactiveApproval.id}`,
      prisma.$executeRaw`UPDATE "Approval" SET "createdAt" = ${newerOldDate}, "updatedAt" = ${newerOldDate} WHERE id = ${latestInactiveApproval.id}`,
    ]);

    const result = await historyCleanupService.cleanupOldHistory();

    const [activeApprovals, inactiveApprovals] = await Promise.all([
      prisma.approval.findMany({
        where: { waitingRoomId: activeRoom.id },
        orderBy: { createdAt: "asc" },
      }),
      prisma.approval.findMany({
        where: { waitingRoomId: inactiveRoom.id },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    expect(result.deletedApprovals).toBeGreaterThanOrEqual(1);
    expect(activeApprovals.map((approval) => approval.id)).toEqual([activeApproval.id]);
    expect(inactiveApprovals.map((approval) => approval.id)).toEqual([latestInactiveApproval.id]);
  });
});

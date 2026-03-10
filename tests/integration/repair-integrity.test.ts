import { EnrollmentStatus, FinanceStatus, WaitingEntryState } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  auditRegistrationIntegrity,
  repairRegistrationIntegrity,
} from "@/domain/services/registration-integrity.service";
import { prisma } from "@/lib/prisma";
import { createTestDbContext, makePrefix } from "../support/db-fixtures";

describe.sequential("Registration integrity repair", () => {
  let ctx = createTestDbContext(makePrefix("repair-db"));

  beforeEach(() => {
    ctx = createTestDbContext(makePrefix("repair-db"));
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("repairs sectionless ledgers, orphaned ledgers, missing ledgers, duplicate ledgers, and section counters", async () => {
    const room = await ctx.createRoom();
    const timeSlot = await ctx.createTimeSlot();

    const studentMissingLedger = await ctx.createStudentAccount({ email: `${ctx.prefix}-missing@ueh.edu.vn` });
    const courseMissingLedger = await ctx.createCourse({ code: `CRS-${ctx.token}-ML` });
    const sectionMissingLedger = await ctx.createSection({
      courseId: courseMissingLedger.id,
      roomId: room.id,
      timeSlotId: timeSlot.id,
      code: `SEC-${ctx.token}-ML`,
      registeredCount: 0,
    });
    await ctx.createEnrollment({
      studentId: studentMissingLedger.id,
      courseId: courseMissingLedger.id,
      sectionId: sectionMissingLedger.id,
      status: EnrollmentStatus.ENROLLED,
    });

    const studentOrphanLedger = await ctx.createStudentAccount({ email: `${ctx.prefix}-orphan@ueh.edu.vn` });
    const courseOrphanLedger = await ctx.createCourse({ code: `CRS-${ctx.token}-OR` });
    const sectionOrphanLedger = await ctx.createSection({
      courseId: courseOrphanLedger.id,
      roomId: room.id,
      timeSlotId: timeSlot.id,
      code: `SEC-${ctx.token}-OR`,
    });
    await ctx.createFinanceLedger({
      studentId: studentOrphanLedger.id,
      courseId: courseOrphanLedger.id,
      sectionId: sectionOrphanLedger.id,
      amount: 1_350_000,
      status: FinanceStatus.POSTED,
    });

    const studentSectionlessLedger = await ctx.createStudentAccount({ email: `${ctx.prefix}-sectionless@ueh.edu.vn` });
    const courseSectionlessLedger = await ctx.createCourse({ code: `CRS-${ctx.token}-SL` });
    const sectionSectionlessLedger = await ctx.createSection({
      courseId: courseSectionlessLedger.id,
      roomId: room.id,
      timeSlotId: timeSlot.id,
      code: `SEC-${ctx.token}-SL`,
      registeredCount: 0,
    });
    await ctx.createEnrollment({
      studentId: studentSectionlessLedger.id,
      courseId: courseSectionlessLedger.id,
      sectionId: sectionSectionlessLedger.id,
      status: EnrollmentStatus.ENROLLED,
    });
    const sectionlessLedger = await ctx.createFinanceLedger({
      studentId: studentSectionlessLedger.id,
      courseId: courseSectionlessLedger.id,
      sectionId: null,
      amount: 1_350_000,
      status: FinanceStatus.POSTED,
    });

    const studentWaiting = await ctx.createStudentAccount({ email: `${ctx.prefix}-waiting@ueh.edu.vn` });
    const courseWaiting = await ctx.createCourse({ code: `CRS-${ctx.token}-WR` });
    const sectionWaiting = await ctx.createSection({
      courseId: courseWaiting.id,
      roomId: room.id,
      timeSlotId: timeSlot.id,
      code: `SEC-${ctx.token}-WR`,
      reservedCount: 0,
      isWaitingOption: true,
    });
    const waitingRoom = await ctx.createWaitingRoom({
      courseId: courseWaiting.id,
    });
    await ctx.createWaitingEntry({
      waitingRoomId: waitingRoom.id,
      studentId: studentWaiting.id,
      state: WaitingEntryState.OFFERED,
      offerSectionId: sectionWaiting.id,
      matchedPriority: 1,
    });

    const before = await auditRegistrationIntegrity();
    expect(before.clean).toBe(false);

    const report = await repairRegistrationIntegrity();

    expect(report.repairs.backfilledLedgerSectionIds).toBeGreaterThanOrEqual(1);
    expect(report.repairs.voidedOrphanLedgers).toBeGreaterThanOrEqual(1);
    expect(report.repairs.createdMissingLedgers).toBeGreaterThanOrEqual(1);
    expect(report.repairs.reconciledSectionCounters).toBeGreaterThanOrEqual(1);
    expect(report.after.clean).toBe(true);

    const [reloadedSectionlessLedger, orphanLedgers, missingLedgerRows, repairedSections] = await Promise.all([
        prisma.financeLedger.findUnique({
          where: { id: sectionlessLedger.id },
        }),
        prisma.financeLedger.findMany({
          where: {
            studentId: studentOrphanLedger.id,
            sectionId: sectionOrphanLedger.id,
          },
        }),
        prisma.financeLedger.findMany({
          where: {
            studentId: studentMissingLedger.id,
            sectionId: sectionMissingLedger.id,
            status: FinanceStatus.POSTED,
          },
        }),
        prisma.section.findMany({
          where: {
            id: {
              in: [sectionMissingLedger.id, sectionSectionlessLedger.id, sectionWaiting.id],
            },
          },
          orderBy: {
            code: "asc",
          },
        }),
      ]);

    expect(reloadedSectionlessLedger?.sectionId).toBe(sectionSectionlessLedger.id);
    expect(orphanLedgers).toHaveLength(1);
    expect(orphanLedgers[0]?.status).toBe(FinanceStatus.VOID);
    expect(missingLedgerRows).toHaveLength(1);
    expect(repairedSections.every((section) => section.registeredCount >= 0 && section.reservedCount >= 0)).toBe(true);
    expect(repairedSections.find((section) => section.id === sectionWaiting.id)?.reservedCount).toBe(1);
  });

  it("reports duplicate active enrollments and ambiguous sectionless ledgers as blockers during audit", async () => {
    const responses = [
      [{ exists: false }],
      [
        {
          studentId: "student-1",
          courseId: "course-1",
          count: 2,
          enrollmentIds: ["enr-1", "enr-2"],
          sectionIds: ["sec-1", "sec-2"],
        },
      ],
      [],
      [],
      [],
      [
        {
          id: "ledger-1",
          studentId: "student-1",
          courseId: "course-1",
          status: FinanceStatus.POSTED,
          activeEnrollmentCount: 2,
          matchingSectionId: null,
          matchingSectionIds: ["sec-1", "sec-2"],
        },
      ],
      [],
      [],
    ];

    const fakeClient = {
      $queryRawUnsafe: async () => responses.shift() ?? [],
    };

    const report = await auditRegistrationIntegrity(fakeClient as never);

    expect(report.clean).toBe(false);
    expect(report.summary.duplicateActiveEnrollment).toBe(1);
    expect(report.summary.sectionlessActiveLedgers).toBe(1);
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Duplicate active enrollments"),
        expect.stringContaining("Sectionless active ledgers"),
      ]),
    );
  });
});

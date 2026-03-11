import { ApprovalStatus, FinanceStatus, Prisma, PrismaClient } from "@prisma/client";
import { TUITION_PER_CREDIT } from "@/lib/constants";
import { matchingService } from "@/domain/services/matching.service";
import { prisma } from "@/lib/prisma";

type QueryClient = PrismaClient | Prisma.TransactionClient;

type DuplicateActiveEnrollmentRow = {
  studentId: string;
  courseId: string;
  count: number;
  enrollmentIds: string[];
  sectionIds: string[];
};

type DuplicateActiveWaitingEntryRow = {
  waitingRoomId: string;
  studentId: string;
  count: number;
  entryIds: string[];
};

type InvalidSectionCounterRow = {
  id: string;
  code: string;
  capacity: number;
  registeredCount: number;
  reservedCount: number;
  actualRegisteredCount: number;
  actualReservedCount: number;
};

type DuplicateActiveLedgerRow = {
  studentId: string;
  sectionId: string;
  count: number;
  ledgerIds: string[];
};

type SectionlessActiveLedgerRow = {
  id: string;
  studentId: string;
  courseId: string | null;
  status: FinanceStatus;
  activeEnrollmentCount: number;
  matchingSectionId: string | null;
  matchingSectionIds: string[];
};

type ActiveLedgerWithoutEnrollmentRow = {
  id: string;
  studentId: string;
  courseId: string | null;
  sectionId: string;
  status: FinanceStatus;
};

type ActiveEnrollmentWithoutLedgerRow = {
  id: string;
  studentId: string;
  courseId: string;
  sectionId: string;
  credits: number;
};

type OrphanActiveWaitingRoomRow = {
  waitingRoomId: string;
  courseId: string;
  courseCode: string;
  activeEntryCount: number;
  queuedCount: number;
  pendingAdminCount: number;
  offeredCount: number;
  approvalCount: number;
};

type IntegrityAnomalies = {
  duplicateActiveEnrollment: DuplicateActiveEnrollmentRow[];
  duplicateActiveWaitingEntry: DuplicateActiveWaitingEntryRow[];
  invalidSectionCounters: InvalidSectionCounterRow[];
  duplicateActiveLedgers: DuplicateActiveLedgerRow[];
  sectionlessActiveLedgers: SectionlessActiveLedgerRow[];
  activeLedgersWithoutEnrollment: ActiveLedgerWithoutEnrollmentRow[];
  activeEnrollmentsWithoutLedger: ActiveEnrollmentWithoutLedgerRow[];
  orphanActiveWaitingRooms: OrphanActiveWaitingRoomRow[];
};

export type RegistrationIntegrityAuditReport = {
  schema: {
    hasEnrollmentCourseId: boolean;
  };
  summary: {
    duplicateActiveEnrollment: number;
    duplicateActiveWaitingEntry: number;
    invalidSectionCounters: number;
    duplicateActiveLedgers: number;
    sectionlessActiveLedgers: number;
    activeLedgersWithoutEnrollment: number;
    activeEnrollmentsWithoutLedger: number;
    orphanActiveWaitingRooms: number;
    migrationBlockers: number;
  };
  details: IntegrityAnomalies;
  blockers: string[];
  clean: boolean;
};

export type RegistrationIntegrityRepairReport = {
  before: RegistrationIntegrityAuditReport;
  after: RegistrationIntegrityAuditReport;
  repairs: {
    backfilledLedgerSectionIds: number;
    voidedOrphanLedgers: number;
    createdMissingLedgers: number;
    deduplicatedLedgerRows: number;
    reconciledSectionCounters: number;
    restoredWaitingRoomApprovals: number;
  };
};

const ACTIVE_LEDGER_STATUSES: FinanceStatus[] = [FinanceStatus.PENDING, FinanceStatus.POSTED];

const activeLedgerStatusesSql = ACTIVE_LEDGER_STATUSES.map((status) => `'${status}'`).join(", ");

const buildEnrollmentCourseExpression = (hasEnrollmentCourseId: boolean) =>
  hasEnrollmentCourseId ? 'e."courseId"' : 's."courseId"';

const duplicateActiveEnrollmentSql = (hasEnrollmentCourseId: boolean) => `
  SELECT
    e."studentId" AS "studentId",
    ${buildEnrollmentCourseExpression(hasEnrollmentCourseId)} AS "courseId",
    COUNT(*)::int AS "count",
    ARRAY_AGG(e.id ORDER BY e."createdAt" DESC) AS "enrollmentIds",
    ARRAY_AGG(e."sectionId" ORDER BY e."createdAt" DESC) AS "sectionIds"
  FROM "Enrollment" e
  JOIN "Section" s ON s.id = e."sectionId"
  WHERE e."status" = 'ENROLLED'
  GROUP BY e."studentId", ${buildEnrollmentCourseExpression(hasEnrollmentCourseId)}
  HAVING COUNT(*) > 1
  ORDER BY COUNT(*) DESC, e."studentId" ASC
`;

const duplicateActiveWaitingEntrySql = `
  SELECT
    "waitingRoomId" AS "waitingRoomId",
    "studentId" AS "studentId",
    COUNT(*)::int AS "count",
    ARRAY_AGG(id ORDER BY "createdAt" DESC) AS "entryIds"
  FROM "WaitingEntry"
  WHERE "state" IN ('QUEUED', 'PENDING_ADMIN', 'OFFERED')
  GROUP BY "waitingRoomId", "studentId"
  HAVING COUNT(*) > 1
  ORDER BY COUNT(*) DESC, "studentId" ASC
`;

const invalidSectionCountersSql = `
  SELECT
    s.id,
    s.code,
    s.capacity,
    s."registeredCount" AS "registeredCount",
    s."reservedCount" AS "reservedCount",
    COALESCE(enrollment_counts."actualRegisteredCount", 0)::int AS "actualRegisteredCount",
    COALESCE(waiting_counts."actualReservedCount", 0)::int AS "actualReservedCount"
  FROM "Section" s
  LEFT JOIN (
    SELECT
      "sectionId",
      COUNT(*)::int AS "actualRegisteredCount"
    FROM "Enrollment"
    WHERE "status" = 'ENROLLED'
    GROUP BY "sectionId"
  ) AS enrollment_counts
    ON enrollment_counts."sectionId" = s.id
  LEFT JOIN (
    SELECT
      "offerSectionId" AS "sectionId",
      COUNT(*)::int AS "actualReservedCount"
    FROM "WaitingEntry"
    WHERE "state" IN ('PENDING_ADMIN', 'OFFERED')
      AND "offerSectionId" IS NOT NULL
    GROUP BY "offerSectionId"
  ) AS waiting_counts
    ON waiting_counts."sectionId" = s.id
  WHERE s."registeredCount" <> COALESCE(enrollment_counts."actualRegisteredCount", 0)
     OR s."reservedCount" <> COALESCE(waiting_counts."actualReservedCount", 0)
     OR s."registeredCount" < 0
     OR s."reservedCount" < 0
     OR s."capacity" < (
       COALESCE(enrollment_counts."actualRegisteredCount", 0)
       + COALESCE(waiting_counts."actualReservedCount", 0)
     )
  ORDER BY s.code ASC
`;

const duplicateActiveLedgersSql = `
  SELECT
    "studentId" AS "studentId",
    "sectionId" AS "sectionId",
    COUNT(*)::int AS "count",
    ARRAY_AGG(id ORDER BY "createdAt" DESC) AS "ledgerIds"
  FROM "FinanceLedger"
  WHERE "status" IN (${activeLedgerStatusesSql})
    AND "sectionId" IS NOT NULL
  GROUP BY "studentId", "sectionId"
  HAVING COUNT(*) > 1
  ORDER BY COUNT(*) DESC, "studentId" ASC
`;

const sectionlessActiveLedgersSql = (hasEnrollmentCourseId: boolean) => `
  SELECT
    f.id,
    f."studentId" AS "studentId",
    f."courseId" AS "courseId",
    f.status,
    COALESCE(matches."activeEnrollmentCount", 0)::int AS "activeEnrollmentCount",
    matches."matchingSectionId" AS "matchingSectionId",
    COALESCE(matches."matchingSectionIds", ARRAY[]::text[]) AS "matchingSectionIds"
  FROM "FinanceLedger" f
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::int AS "activeEnrollmentCount",
      CASE WHEN COUNT(*) = 1 THEN MAX(e."sectionId") ELSE NULL END AS "matchingSectionId",
      ARRAY_AGG(e."sectionId" ORDER BY e."createdAt" DESC) AS "matchingSectionIds"
    FROM "Enrollment" e
    JOIN "Section" s ON s.id = e."sectionId"
    WHERE e."status" = 'ENROLLED'
      AND e."studentId" = f."studentId"
      AND ${buildEnrollmentCourseExpression(hasEnrollmentCourseId)} = f."courseId"
  ) matches ON TRUE
  WHERE f."status" IN (${activeLedgerStatusesSql})
    AND f."sectionId" IS NULL
  ORDER BY f."createdAt" DESC
`;

const activeLedgersWithoutEnrollmentSql = `
  SELECT
    f.id,
    f."studentId" AS "studentId",
    f."courseId" AS "courseId",
    f."sectionId" AS "sectionId",
    f.status
  FROM "FinanceLedger" f
  LEFT JOIN "Enrollment" e
    ON e."studentId" = f."studentId"
   AND e."sectionId" = f."sectionId"
   AND e."status" = 'ENROLLED'
  WHERE f."status" IN (${activeLedgerStatusesSql})
    AND f."sectionId" IS NOT NULL
    AND e.id IS NULL
  ORDER BY f."createdAt" DESC
`;

const activeEnrollmentsWithoutLedgerSql = (hasEnrollmentCourseId: boolean) => `
  SELECT
    e.id,
    e."studentId" AS "studentId",
    ${buildEnrollmentCourseExpression(hasEnrollmentCourseId)} AS "courseId",
    e."sectionId" AS "sectionId",
    c.credits::int AS credits
  FROM "Enrollment" e
  JOIN "Section" s ON s.id = e."sectionId"
  JOIN "Course" c ON c.id = ${buildEnrollmentCourseExpression(hasEnrollmentCourseId)}
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS "activeLedgerCount"
    FROM "FinanceLedger" f
    WHERE f."studentId" = e."studentId"
      AND f."sectionId" = e."sectionId"
      AND f."status" IN (${activeLedgerStatusesSql})
  ) ledgers ON TRUE
  WHERE e."status" = 'ENROLLED'
    AND COALESCE(ledgers."activeLedgerCount", 0) = 0
  ORDER BY e."createdAt" DESC
`;

const orphanActiveWaitingRoomsSql = `
  SELECT
    wr.id AS "waitingRoomId",
    wr."courseId" AS "courseId",
    c.code AS "courseCode",
    COUNT(DISTINCT we.id) FILTER (WHERE we."state" IN ('QUEUED', 'PENDING_ADMIN', 'OFFERED'))::int AS "activeEntryCount",
    COUNT(DISTINCT we.id) FILTER (WHERE we."state" = 'QUEUED')::int AS "queuedCount",
    COUNT(DISTINCT we.id) FILTER (WHERE we."state" = 'PENDING_ADMIN')::int AS "pendingAdminCount",
    COUNT(DISTINCT we.id) FILTER (WHERE we."state" = 'OFFERED')::int AS "offeredCount",
    COUNT(DISTINCT a.id)::int AS "approvalCount"
  FROM "WaitingRoom" wr
  JOIN "Course" c ON c.id = wr."courseId"
  LEFT JOIN "WaitingEntry" we ON we."waitingRoomId" = wr.id
  LEFT JOIN "Approval" a ON a."waitingRoomId" = wr.id
  WHERE wr."isActive" = true
  GROUP BY wr.id, wr."courseId", c.code
  HAVING COUNT(DISTINCT a.id) = 0
     AND COUNT(DISTINCT we.id) FILTER (WHERE we."state" IN ('QUEUED', 'PENDING_ADMIN', 'OFFERED')) > 0
  ORDER BY c.code ASC
`;

const detectEnrollmentCourseId = async (client: QueryClient) => {
  const rows = await client.$queryRawUnsafe<Array<{ exists: boolean }>>(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Enrollment'
        AND column_name = 'courseId'
    ) AS "exists"
  `);

  return rows[0]?.exists ?? false;
};

const loadIntegrityAnomalies = async (
  client: QueryClient,
  hasEnrollmentCourseId: boolean,
): Promise<IntegrityAnomalies> => {
  const [
    duplicateActiveEnrollment,
    duplicateActiveWaitingEntry,
    invalidSectionCounters,
    duplicateActiveLedgers,
    sectionlessActiveLedgers,
    activeLedgersWithoutEnrollment,
    activeEnrollmentsWithoutLedger,
    orphanActiveWaitingRooms,
  ] = await Promise.all([
    client.$queryRawUnsafe<DuplicateActiveEnrollmentRow[]>(duplicateActiveEnrollmentSql(hasEnrollmentCourseId)),
    client.$queryRawUnsafe<DuplicateActiveWaitingEntryRow[]>(duplicateActiveWaitingEntrySql),
    client.$queryRawUnsafe<InvalidSectionCounterRow[]>(invalidSectionCountersSql),
    client.$queryRawUnsafe<DuplicateActiveLedgerRow[]>(duplicateActiveLedgersSql),
    client.$queryRawUnsafe<SectionlessActiveLedgerRow[]>(sectionlessActiveLedgersSql(hasEnrollmentCourseId)),
    client.$queryRawUnsafe<ActiveLedgerWithoutEnrollmentRow[]>(activeLedgersWithoutEnrollmentSql),
    client.$queryRawUnsafe<ActiveEnrollmentWithoutLedgerRow[]>(activeEnrollmentsWithoutLedgerSql(hasEnrollmentCourseId)),
    client.$queryRawUnsafe<OrphanActiveWaitingRoomRow[]>(orphanActiveWaitingRoomsSql),
  ]);

  return {
    duplicateActiveEnrollment,
    duplicateActiveWaitingEntry,
    invalidSectionCounters,
    duplicateActiveLedgers,
    sectionlessActiveLedgers,
    activeLedgersWithoutEnrollment,
    activeEnrollmentsWithoutLedger,
    orphanActiveWaitingRooms,
  };
};

const buildBlockers = (anomalies: IntegrityAnomalies) => {
  const blockers: string[] = [];

  if (anomalies.duplicateActiveEnrollment.length > 0) {
    blockers.push(
      `Duplicate active enrollments found for ${anomalies.duplicateActiveEnrollment.length} student/course combinations.`,
    );
  }

  if (anomalies.duplicateActiveWaitingEntry.length > 0) {
    blockers.push(
      `Duplicate active waiting entries found for ${anomalies.duplicateActiveWaitingEntry.length} waiting-room/student combinations.`,
    );
  }

  const overflowedSections = anomalies.invalidSectionCounters.filter(
    (row) => row.capacity < row.actualRegisteredCount + row.actualReservedCount,
  );
  if (overflowedSections.length > 0) {
    blockers.push(`Section capacity is below actual load for ${overflowedSections.length} sections.`);
  }

  const ambiguousSectionlessLedgers = anomalies.sectionlessActiveLedgers.filter((row) => row.activeEnrollmentCount > 1);
  if (ambiguousSectionlessLedgers.length > 0) {
    blockers.push(
      `Sectionless active ledgers map to multiple active enrollments for ${ambiguousSectionlessLedgers.length} rows.`,
    );
  }

  return blockers;
};

const buildAuditReport = (
  hasEnrollmentCourseId: boolean,
  anomalies: IntegrityAnomalies,
): RegistrationIntegrityAuditReport => {
  const blockers = buildBlockers(anomalies);
  const summary = {
    duplicateActiveEnrollment: anomalies.duplicateActiveEnrollment.length,
    duplicateActiveWaitingEntry: anomalies.duplicateActiveWaitingEntry.length,
    invalidSectionCounters: anomalies.invalidSectionCounters.length,
    duplicateActiveLedgers: anomalies.duplicateActiveLedgers.length,
    sectionlessActiveLedgers: anomalies.sectionlessActiveLedgers.length,
    activeLedgersWithoutEnrollment: anomalies.activeLedgersWithoutEnrollment.length,
    activeEnrollmentsWithoutLedger: anomalies.activeEnrollmentsWithoutLedger.length,
    orphanActiveWaitingRooms: anomalies.orphanActiveWaitingRooms.length,
    migrationBlockers: blockers.length,
  };

  return {
    schema: { hasEnrollmentCourseId },
    summary,
    details: anomalies,
    blockers,
    clean: Object.values(summary).every((value) => value === 0),
  };
};

const buildCourseKey = (studentId: string, courseId: string) => `${studentId}:${courseId}`;

export const auditRegistrationIntegrity = async (
  client: QueryClient = prisma,
): Promise<RegistrationIntegrityAuditReport> => {
  const hasEnrollmentCourseId = await detectEnrollmentCourseId(client);
  const anomalies = await loadIntegrityAnomalies(client, hasEnrollmentCourseId);
  return buildAuditReport(hasEnrollmentCourseId, anomalies);
};

export const repairRegistrationIntegrity = async (
  client: PrismaClient = prisma,
): Promise<RegistrationIntegrityRepairReport> => {
  const before = await auditRegistrationIntegrity(client);
  const repairs = {
    backfilledLedgerSectionIds: 0,
    voidedOrphanLedgers: 0,
    createdMissingLedgers: 0,
    deduplicatedLedgerRows: 0,
    reconciledSectionCounters: 0,
    restoredWaitingRoomApprovals: 0,
  };
  const roomsToRematch = new Set<string>();

  await client.$transaction(async (tx) => {
    const hasEnrollmentCourseId = await detectEnrollmentCourseId(tx);
    const anomalies = await loadIntegrityAnomalies(tx, hasEnrollmentCourseId);
    const blockedEnrollmentCourseKeys = new Set(
      anomalies.duplicateActiveEnrollment.map((row) => buildCourseKey(row.studentId, row.courseId)),
    );

    for (const row of anomalies.duplicateActiveLedgers) {
      const [, ...duplicateIds] = row.ledgerIds;
      if (!duplicateIds.length) {
        continue;
      }

      const result = await tx.financeLedger.updateMany({
        where: {
          id: { in: duplicateIds },
          status: {
            in: ACTIVE_LEDGER_STATUSES,
          },
        },
        data: {
          status: FinanceStatus.VOID,
        },
      });
      repairs.deduplicatedLedgerRows += result.count;
    }

    for (const row of anomalies.sectionlessActiveLedgers) {
      if (!row.courseId || row.activeEnrollmentCount === 0) {
        const result = await tx.financeLedger.updateMany({
          where: {
            id: row.id,
            status: {
              in: ACTIVE_LEDGER_STATUSES,
            },
          },
          data: {
            status: FinanceStatus.VOID,
          },
        });
        repairs.voidedOrphanLedgers += result.count;
        continue;
      }

      if (row.activeEnrollmentCount === 1 && row.matchingSectionId) {
        const result = await tx.financeLedger.updateMany({
          where: {
            id: row.id,
            sectionId: null,
            status: {
              in: ACTIVE_LEDGER_STATUSES,
            },
          },
          data: {
            sectionId: row.matchingSectionId,
          },
        });
        repairs.backfilledLedgerSectionIds += result.count;
      }
    }

    for (const row of anomalies.activeLedgersWithoutEnrollment) {
      const result = await tx.financeLedger.updateMany({
        where: {
          id: row.id,
          status: {
            in: ACTIVE_LEDGER_STATUSES,
          },
        },
        data: {
          status: FinanceStatus.VOID,
        },
      });
      repairs.voidedOrphanLedgers += result.count;
    }

    for (const row of anomalies.activeEnrollmentsWithoutLedger) {
      if (blockedEnrollmentCourseKeys.has(buildCourseKey(row.studentId, row.courseId))) {
        continue;
      }

      const existingLedger = await tx.financeLedger.findFirst({
        where: {
          studentId: row.studentId,
          sectionId: row.sectionId,
          status: {
            in: ACTIVE_LEDGER_STATUSES,
          },
        },
        select: { id: true },
      });
      if (existingLedger) {
        continue;
      }

      await tx.financeLedger.create({
        data: {
          studentId: row.studentId,
          courseId: row.courseId,
          sectionId: row.sectionId,
          amount: row.credits * TUITION_PER_CREDIT,
          status: FinanceStatus.POSTED,
        },
      });
      repairs.createdMissingLedgers += 1;
    }

    for (const row of anomalies.invalidSectionCounters) {
      if (row.capacity < row.actualRegisteredCount + row.actualReservedCount) {
        continue;
      }

      const result = await tx.section.updateMany({
        where: {
          id: row.id,
        },
        data: {
          registeredCount: row.actualRegisteredCount,
          reservedCount: row.actualReservedCount,
        },
      });
      repairs.reconciledSectionCounters += result.count;
    }

    for (const row of anomalies.orphanActiveWaitingRooms) {
      const existingApproval = await tx.approval.findFirst({
        where: {
          waitingRoomId: row.waitingRoomId,
        },
        select: {
          id: true,
        },
      });
      if (existingApproval) {
        continue;
      }

      await tx.approval.create({
        data: {
          waitingRoomId: row.waitingRoomId,
          status: ApprovalStatus.APPROVED,
          reason: "Integrity repair restored missing approval anchor for active waiting room",
          dueAt: new Date(),
        },
      });
      repairs.restoredWaitingRoomApprovals += 1;
      roomsToRematch.add(row.waitingRoomId);
    }
  });

  for (const waitingRoomId of roomsToRematch) {
    await matchingService.matchWaitingRoom(waitingRoomId);
  }

  const after = await auditRegistrationIntegrity(client);
  return {
    before,
    after,
    repairs,
  };
};

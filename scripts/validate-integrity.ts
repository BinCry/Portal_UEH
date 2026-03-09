import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const run = async () => {
  const [duplicateActiveEnrollment, duplicateActiveWaitingEntry, invalidSectionCounters] = await Promise.all([
    prisma.$queryRaw<Array<{ studentId: string; courseId: string; count: number }>>`
      SELECT "studentId", "courseId", COUNT(*)::int AS "count"
      FROM "Enrollment"
      WHERE "status" = 'ENROLLED'
      GROUP BY "studentId", "courseId"
      HAVING COUNT(*) > 1
    `,
    prisma.$queryRaw<Array<{ waitingRoomId: string; studentId: string; count: number }>>`
      SELECT "waitingRoomId", "studentId", COUNT(*)::int AS "count"
      FROM "WaitingEntry"
      WHERE "state" IN ('QUEUED', 'PENDING_ADMIN', 'OFFERED')
      GROUP BY "waitingRoomId", "studentId"
      HAVING COUNT(*) > 1
    `,
    prisma.$queryRaw<Array<{ id: string; code: string; capacity: number; registeredCount: number; reservedCount: number }>>`
      SELECT "id", "code", "capacity", "registeredCount", "reservedCount"
      FROM "Section"
      WHERE "registeredCount" < 0
         OR "reservedCount" < 0
         OR "capacity" < ("registeredCount" + "reservedCount")
    `,
  ]);

  const hasError =
    duplicateActiveEnrollment.length > 0 || duplicateActiveWaitingEntry.length > 0 || invalidSectionCounters.length > 0;

  const report = {
    duplicateActiveEnrollment: duplicateActiveEnrollment.length,
    duplicateActiveWaitingEntry: duplicateActiveWaitingEntry.length,
    invalidSectionCounters: invalidSectionCounters.length,
    samples: {
      duplicateActiveEnrollment: duplicateActiveEnrollment.slice(0, 5),
      duplicateActiveWaitingEntry: duplicateActiveWaitingEntry.slice(0, 5),
      invalidSectionCounters: invalidSectionCounters.slice(0, 5),
    },
  };

  if (hasError) {
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify(report, null, 2));
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

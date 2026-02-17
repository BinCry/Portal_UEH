import { EnrollmentStatus, WaitingEntryState } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/route-guards";

export async function GET() {
  const auth = await requireApiRole("STUDENT");
  if (!auth.ok) {
    return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);
  }

  const [enrollments, confirmedEntries] = await Promise.all([
    prisma.enrollment.findMany({
      where: {
        studentId: auth.user.id,
        status: EnrollmentStatus.ENROLLED,
      },
      include: {
        section: {
          include: {
            course: true,
            room: true,
            timeSlot: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.waitingEntry.findMany({
      where: {
        studentId: auth.user.id,
        state: WaitingEntryState.CONFIRMED,
        offerSectionId: { not: null },
      },
      select: {
        offerSectionId: true,
      },
    }),
  ]);

  const waitingSectionIds = new Set(confirmedEntries.map((entry) => entry.offerSectionId).filter(Boolean));

  return ok(
    enrollments.map((enrollment) => ({
      ...enrollment,
      source: waitingSectionIds.has(enrollment.sectionId) ? "WAITING_ROOM" : "DIRECT",
    })),
  );
}

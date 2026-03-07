import { EnrollmentStatus, WaitingEntryState } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { withApiTiming } from "@/lib/api-timing";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/route-guards";

export async function GET() {
  return withApiTiming("GET /api/enrollments/me", async () => {
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
        select: {
          id: true,
          sectionId: true,
          createdAt: true,
          section: {
            select: {
              code: true,
              dayOfWeek: true,
              startDate: true,
              endDate: true,
              course: {
                select: {
                  code: true,
                  name: true,
                },
              },
              room: {
                select: {
                  campus: true,
                  code: true,
                  address: true,
                },
              },
              timeSlot: {
                select: {
                  label: true,
                  startTime: true,
                  endTime: true,
                },
              },
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
  });
}

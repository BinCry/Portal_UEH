import { ApprovalStatus, WaitingEntryState } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/route-guards";

export async function GET() {
  const auth = await requireApiRole("ADMIN");
  if (!auth.ok) return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);

  const recentDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const rooms = await prisma.waitingRoom.findMany({
    where: {
      OR: [
        {
          isActive: true,
        },
        {
          approvals: {
            some: {
              updatedAt: {
                gte: recentDate,
              },
            },
          },
        },
      ],
    },
    include: {
      course: true,
      entries: {
        where: {
          state: {
            in: [WaitingEntryState.QUEUED, WaitingEntryState.PENDING_ADMIN, WaitingEntryState.OFFERED],
          },
        },
        include: {
          student: {
            select: {
              email: true,
              studentProfile: {
                select: {
                  fullName: true,
                  studentCode: true,
                },
              },
            },
          },
          offerSection: {
            select: {
              id: true,
              code: true,
            },
          },
        },
      },
      approvals: {
        orderBy: {
          createdAt: "desc",
        },
        take: 5,
      },
    },
    orderBy: {
      activatedAt: "desc",
    },
  });

  return ok(
    rooms.map((room) => ({
      ...room,
      waitingCount: room.entries.length,
      pendingApproval: room.approvals.find((approval) => approval.status === ApprovalStatus.PENDING) ?? null,
      latestApproval: room.approvals[0] ?? null,
      pendingEntries: room.entries
        .filter((entry) => entry.state === WaitingEntryState.PENDING_ADMIN)
        .map((entry) => ({
          id: entry.id,
          studentId: entry.studentId,
          studentName: entry.student.studentProfile?.fullName ?? entry.student.email,
          studentCode: entry.student.studentProfile?.studentCode ?? null,
          state: entry.state,
          joinedAt: entry.joinedAt,
          matchedPriority: entry.matchedPriority,
          reason: entry.reason,
          offerSection: entry.offerSection,
        })),
    })),
  );
}

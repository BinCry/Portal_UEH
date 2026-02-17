import { ApprovalStatus, WaitingEntryState } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { withApiTiming } from "@/lib/api-timing";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/route-guards";

export async function GET() {
  return withApiTiming("GET /api/admin/waiting/rooms", async () => {
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
      select: {
        id: true,
        isActive: true,
        activatedAt: true,
        course: {
          select: {
            code: true,
            name: true,
          },
        },
        entries: {
          where: {
            state: {
              in: [WaitingEntryState.PENDING_ADMIN],
            },
          },
          select: {
            id: true,
            studentId: true,
            state: true,
            joinedAt: true,
            matchedPriority: true,
            reason: true,
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
          select: {
            id: true,
            status: true,
            reason: true,
            updatedAt: true,
            dueAt: true,
          },
        },
      },
      orderBy: {
        activatedAt: "desc",
      },
    });

    const waitingCountRows = await prisma.waitingEntry.groupBy({
      by: ["waitingRoomId"],
      where: {
        waitingRoomId: {
          in: rooms.map((room) => room.id),
        },
        state: {
          in: [WaitingEntryState.QUEUED, WaitingEntryState.PENDING_ADMIN, WaitingEntryState.OFFERED],
        },
      },
      _count: {
        _all: true,
      },
    });
    const waitingCountMap = new Map(waitingCountRows.map((row) => [row.waitingRoomId, row._count._all]));

    return ok(
      rooms.map((room) => ({
        ...room,
        waitingCount: waitingCountMap.get(room.id) ?? 0,
        pendingApproval: room.approvals.find((approval) => approval.status === ApprovalStatus.PENDING) ?? null,
        latestApproval: room.approvals[0] ?? null,
        pendingEntries: room.entries.map((entry) => ({
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
  });
}

import { ApprovalStatus, WaitingEntryState } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { withApiTiming } from "@/lib/api-timing";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/route-guards";
import { deriveWaitingRoomOperationalStatus } from "@/domain/services/waiting-room-state.service";

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
              in: [WaitingEntryState.QUEUED, WaitingEntryState.PENDING_ADMIN],
            },
          },
          orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
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
      by: ["waitingRoomId", "state"],
      where: {
        waitingRoomId: {
          in: rooms.map((room) => room.id),
        },
        state: {
          in: [
            WaitingEntryState.QUEUED,
            WaitingEntryState.PENDING_ADMIN,
            WaitingEntryState.OFFERED,
          ],
        },
      },
      _count: {
        _all: true,
      },
    });
    const waitingCountMap = new Map<
      string,
      { queued: number; pendingAdmin: number; offered: number }
    >();
    for (const row of waitingCountRows) {
      const current = waitingCountMap.get(row.waitingRoomId) ?? {
        queued: 0,
        pendingAdmin: 0,
        offered: 0,
      };
      if (row.state === WaitingEntryState.QUEUED) current.queued = row._count._all;
      if (row.state === WaitingEntryState.PENDING_ADMIN) current.pendingAdmin = row._count._all;
      if (row.state === WaitingEntryState.OFFERED) current.offered = row._count._all;
      waitingCountMap.set(row.waitingRoomId, current);
    }

    return ok(
      rooms.map((room) => {
        const counts = waitingCountMap.get(room.id) ?? { queued: 0, pendingAdmin: 0, offered: 0 };
        const pendingApproval =
          room.approvals.find((approval) => approval.status === ApprovalStatus.PENDING) ?? null;
        const latestApproval = room.approvals[0] ?? null;
        const roomStatus = deriveWaitingRoomOperationalStatus({
          isActive: room.isActive,
          approvalsCount: room.approvals.length,
          queuedCount: counts.queued,
          pendingAdminCount: counts.pendingAdmin,
          offeredCount: counts.offered,
          latestApproval,
          pendingApproval,
        });
        const queuedEntries = room.entries.filter(
          (entry) => entry.state === WaitingEntryState.QUEUED,
        );
        const pendingEntries = room.entries.filter(
          (entry) => entry.state === WaitingEntryState.PENDING_ADMIN,
        );

        return {
          ...room,
          waitingCount: counts.queued + counts.pendingAdmin + counts.offered,
          queuedCount: counts.queued,
          pendingAdminCount: counts.pendingAdmin,
          offeredCount: counts.offered,
          roomStatus,
          hasPendingApproval: Boolean(pendingApproval),
          isOrphanActive: roomStatus === "ORPHAN_ACTIVE",
          pendingApproval,
          latestApproval,
          queuedEntries: queuedEntries.map((entry, index) => ({
            id: entry.id,
            studentId: entry.studentId,
            studentName: entry.student.studentProfile?.fullName ?? entry.student.email,
            studentCode: entry.student.studentProfile?.studentCode ?? null,
            state: entry.state,
            joinedAt: entry.joinedAt,
            fifoPosition: index + 1,
            reason: entry.reason,
          })),
          pendingEntries: pendingEntries.map((entry) => ({
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
        };
      }),
    );
  });
}

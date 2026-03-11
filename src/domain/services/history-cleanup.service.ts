import { ApprovalStatus, WaitingEntryState } from "@prisma/client";
import { HISTORY_RETENTION_DAYS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

const terminalWaitingStates: WaitingEntryState[] = [
  WaitingEntryState.CONFIRMED,
  WaitingEntryState.DECLINED,
  WaitingEntryState.EXPIRED,
  WaitingEntryState.FAILED,
  WaitingEntryState.DEFERRED,
];

const cutoffFromNow = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

export const historyCleanupService = {
  async cleanupOldHistory() {
    const retentionDays = Math.max(HISTORY_RETENTION_DAYS, 1);
    const cutoffDate = cutoffFromNow(retentionDays);

    const result = await prisma.$transaction(async (tx) => {
      const latestApprovalRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT DISTINCT ON ("waitingRoomId") id
        FROM "Approval"
        ORDER BY "waitingRoomId", "updatedAt" DESC, "createdAt" DESC, id DESC
      `;
      const protectedApprovalIds = latestApprovalRows.map((row) => row.id);

      const deletedWaitingEntries = await tx.waitingEntry.deleteMany({
        where: {
          state: {
            in: terminalWaitingStates,
          },
          updatedAt: {
            lte: cutoffDate,
          },
        },
      });

      const deletedApprovals = await tx.approval.deleteMany({
        where: {
          status: {
            not: ApprovalStatus.PENDING,
          },
          updatedAt: {
            lte: cutoffDate,
          },
          waitingRoom: {
            isActive: false,
          },
          id: protectedApprovalIds.length
            ? {
              notIn: protectedApprovalIds,
            }
            : undefined,
        },
      });

      const deletedNotifications = await tx.notification.deleteMany({
        where: {
          createdAt: {
            lte: cutoffDate,
          },
        },
      });

      return {
        deletedWaitingEntries,
        deletedApprovals,
        deletedNotifications,
      };
    });

    return {
      retentionDays,
      cutoffDate: cutoffDate.toISOString(),
      deletedWaitingEntries: result.deletedWaitingEntries.count,
      deletedApprovals: result.deletedApprovals.count,
      deletedNotifications: result.deletedNotifications.count,
    };
  },
};

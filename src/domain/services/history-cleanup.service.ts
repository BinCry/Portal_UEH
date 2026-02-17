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

    const [deletedWaitingEntries, deletedApprovals, deletedNotifications] = await prisma.$transaction([
      prisma.waitingEntry.deleteMany({
        where: {
          state: {
            in: terminalWaitingStates,
          },
          updatedAt: {
            lte: cutoffDate,
          },
        },
      }),
      prisma.approval.deleteMany({
        where: {
          status: {
            not: ApprovalStatus.PENDING,
          },
          updatedAt: {
            lte: cutoffDate,
          },
        },
      }),
      prisma.notification.deleteMany({
        where: {
          createdAt: {
            lte: cutoffDate,
          },
        },
      }),
    ]);

    return {
      retentionDays,
      cutoffDate: cutoffDate.toISOString(),
      deletedWaitingEntries: deletedWaitingEntries.count,
      deletedApprovals: deletedApprovals.count,
      deletedNotifications: deletedNotifications.count,
    };
  },
};

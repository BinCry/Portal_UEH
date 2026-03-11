import { ApprovalStatus } from "@prisma/client";

export const ACTIVE_WAITING_ENTRY_STATES = ["QUEUED", "PENDING_ADMIN", "OFFERED"] as const;

export type WaitingRoomOperationalStatus =
  | "PENDING_REVIEW"
  | "APPROVED_ACTIVE"
  | "REJECTED_CLOSED"
  | "ORPHAN_ACTIVE";

type ApprovalSnapshot = {
  id: string;
  status: ApprovalStatus;
  reason: string | null;
  updatedAt: Date;
  dueAt: Date;
} | null;

type WaitingRoomOperationalStateInput = {
  isActive: boolean;
  approvalsCount: number;
  queuedCount: number;
  pendingAdminCount: number;
  offeredCount: number;
  latestApproval: ApprovalSnapshot;
  pendingApproval: ApprovalSnapshot;
};

const APPROVED_STATUSES: ApprovalStatus[] = [ApprovalStatus.APPROVED, ApprovalStatus.AUTO_APPROVED];

export const deriveWaitingRoomOperationalStatus = ({
  isActive,
  approvalsCount,
  queuedCount,
  pendingAdminCount,
  offeredCount,
  latestApproval,
  pendingApproval,
}: WaitingRoomOperationalStateInput): WaitingRoomOperationalStatus => {
  if (pendingApproval) {
    return "PENDING_REVIEW";
  }

  const activeEntryCount = queuedCount + pendingAdminCount + offeredCount;
  if (isActive && approvalsCount === 0 && activeEntryCount > 0) {
    return "ORPHAN_ACTIVE";
  }

  if (latestApproval?.status === ApprovalStatus.REJECTED || !isActive) {
    return "REJECTED_CLOSED";
  }

  if (latestApproval && APPROVED_STATUSES.includes(latestApproval.status)) {
    return "APPROVED_ACTIVE";
  }

  return "PENDING_REVIEW";
};

export const isWaitingRoomEffectivelyApproved = (input: WaitingRoomOperationalStateInput) =>
  input.isActive &&
  !input.pendingApproval &&
  Boolean(input.latestApproval && APPROVED_STATUSES.includes(input.latestApproval.status));

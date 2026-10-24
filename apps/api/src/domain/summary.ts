import type { AuditSummary, OwnerProgressDto, RequestStatus } from '@evidencechase/shared';

export type StatusCounts = Partial<Record<RequestStatus, number>>;

/** Builds an audit's readiness summary from per-status counts. */
export function buildAuditSummary(counts: StatusCounts, overdue: number): AuditSummary {
  const pending = counts.PENDING ?? 0;
  const submitted = counts.SUBMITTED ?? 0;
  const changesRequested = counts.CHANGES_REQUESTED ?? 0;
  const accepted = counts.ACCEPTED ?? 0;
  const total = pending + submitted + changesRequested + accepted;

  return {
    total,
    pending,
    submitted,
    changesRequested,
    accepted,
    overdue,
    // Floor rather than round, so an audit never shows 100% until every request is accepted.
    percentComplete: total === 0 ? 0 : Math.floor((accepted / total) * 100),
  };
}

export interface OwnerStatusCount {
  ownerEmail: string;
  status: RequestStatus;
  count: number;
}

/**
 * Per-owner progress from per-(owner, status) counts. Owners who still owe the most come first,
 * then those with the most overdue, so the manager sees who to chase at the top.
 */
export function buildOwnerProgress(
  counts: OwnerStatusCount[],
  overdueByOwner: Map<string, number>,
  ownerNames: Map<string, string | null>,
): OwnerProgressDto[] {
  const owners = new Map<string, OwnerProgressDto>();
  for (const { ownerEmail, status, count } of counts) {
    const owner = owners.get(ownerEmail) ?? {
      ownerEmail,
      ownerName: ownerNames.get(ownerEmail) ?? null,
      total: 0,
      accepted: 0,
      inReview: 0,
      waiting: 0,
      overdue: overdueByOwner.get(ownerEmail) ?? 0,
    };
    owner.total += count;
    if (status === 'ACCEPTED') owner.accepted += count;
    else if (status === 'SUBMITTED') owner.inReview += count;
    else owner.waiting += count;
    owners.set(ownerEmail, owner);
  }
  return [...owners.values()].sort(
    (a, b) =>
      b.waiting - a.waiting || b.overdue - a.overdue || a.ownerEmail.localeCompare(b.ownerEmail),
  );
}

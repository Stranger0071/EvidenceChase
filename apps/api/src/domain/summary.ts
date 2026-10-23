import type { AuditSummary, RequestStatus } from '@evidencechase/shared';

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

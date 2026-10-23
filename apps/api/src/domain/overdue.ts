import type { RequestStatus } from '@evidencechase/shared';

/** Statuses where the owner still owes evidence. */
export const OPEN_STATUSES: readonly RequestStatus[] = ['PENDING', 'CHANGES_REQUESTED'];

/**
 * Overdue is derived, never stored (FR-6): a request is overdue when the owner still owes
 * evidence and the due date has passed. A request due today is not yet overdue.
 * Both dates are YYYY-MM-DD strings, which compare correctly as plain strings.
 */
export function isOverdue(
  request: { status: RequestStatus; dueDate: string },
  today: string,
): boolean {
  return OPEN_STATUSES.includes(request.status) && request.dueDate < today;
}

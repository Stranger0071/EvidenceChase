/** Scheduled reminder kinds, matching the `ReminderKind` database enum (NUDGE is manual). */
export type ScheduledReminderKind =
  'T_MINUS_7' | 'T_MINUS_3' | 'T_MINUS_1' | 'DUE_TODAY' | 'OVERDUE';

/** Once overdue, the owner is reminded every this many days (FR-13: +3, +6, +9 …). */
export const OVERDUE_INTERVAL_DAYS = 3;

const BEFORE_DUE: Record<number, ScheduledReminderKind> = {
  7: 'T_MINUS_7',
  3: 'T_MINUS_3',
  1: 'T_MINUS_1',
  0: 'DUE_TODAY',
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole calendar days from `from` to `to` (both YYYY-MM-DD, compared as UTC dates). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}

/**
 * Which reminder (if any) is due today for a request with this due date (PRD FR-13): 7, 3 and 1
 * days before, on the day, and every 3 days once overdue. Pure and date-only, so there are no
 * timezone surprises: the job runs at 09:00 IST, which is 03:30 UTC on the same calendar day.
 */
export function computeReminderKind(dueDate: string, today: string): ScheduledReminderKind | null {
  const daysLeft = daysBetween(today, dueDate);
  if (daysLeft >= 0) return BEFORE_DUE[daysLeft] ?? null;
  return -daysLeft % OVERDUE_INTERVAL_DAYS === 0 ? 'OVERDUE' : null;
}

/** How the reminder email describes a due date relative to today. */
export function describeDue(dueDate: string, today: string): string {
  const daysLeft = daysBetween(today, dueDate);
  if (daysLeft === 0) return 'Due today';
  if (daysLeft === 1) return 'Due tomorrow';
  if (daysLeft > 1) return `Due in ${daysLeft} days`;
  return daysLeft === -1 ? 'Overdue by 1 day' : `Overdue by ${-daysLeft} days`;
}

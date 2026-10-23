import { z } from 'zod';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True for a real calendar date in YYYY-MM-DD form. Rejects impossible dates such as
 * 2026-02-30, which `new Date()` would otherwise silently roll over into March.
 */
export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export const isoDateSchema = z
  .string()
  .trim()
  .refine(isValidIsoDate, 'Must be a valid date in YYYY-MM-DD format');

/** Formats a date as YYYY-MM-DD in UTC. Due dates are calendar dates, so we never use local time. */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function todayIsoDate(now: Date = new Date()): string {
  return toIsoDate(now);
}

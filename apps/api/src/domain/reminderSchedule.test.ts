import { todayIsoDate } from '@evidencechase/shared';
import { describe, expect, it } from 'vitest';
import { computeReminderKind, daysBetween, describeDue } from './reminderSchedule';

const TODAY = '2026-10-25';

describe('computeReminderKind', () => {
  it.each([
    ['2026-11-01', 'T_MINUS_7'],
    ['2026-10-28', 'T_MINUS_3'],
    ['2026-10-26', 'T_MINUS_1'],
    ['2026-10-25', 'DUE_TODAY'],
    ['2026-10-22', 'OVERDUE'], // +3
    ['2026-10-19', 'OVERDUE'], // +6
    ['2026-10-16', 'OVERDUE'], // +9
  ])('due %s → %s', (dueDate, kind) => {
    expect(computeReminderKind(dueDate, TODAY)).toBe(kind);
  });

  it.each([
    '2026-11-02',
    '2026-10-30',
    '2026-10-27',
    '2026-10-24',
    '2026-10-23',
    '2026-10-21',
    '2026-10-20',
  ])('sends nothing when due %s', (dueDate) => {
    expect(computeReminderKind(dueDate, TODAY)).toBeNull();
  });

  it('sends nothing for requests due far in the future', () => {
    expect(computeReminderKind('2027-06-01', TODAY)).toBeNull();
  });

  it('counts across month and year boundaries', () => {
    expect(computeReminderKind('2027-01-03', '2026-12-27')).toBe('T_MINUS_7');
    expect(computeReminderKind('2026-12-29', '2027-01-01')).toBe('OVERDUE');
  });

  it('handles leap day', () => {
    expect(computeReminderKind('2028-03-01', '2028-02-29')).toBe('T_MINUS_1');
    expect(computeReminderKind('2028-02-29', '2028-02-22')).toBe('T_MINUS_7');
  });

  it('chases a request that was created already overdue', () => {
    expect(computeReminderKind('2026-09-25', TODAY)).toBe('OVERDUE'); // 30 days late
  });

  it('uses the UTC date: 09:00 IST is still the same UTC day', () => {
    const nineAmIst = new Date('2026-10-25T03:30:00Z');
    expect(computeReminderKind('2026-10-25', todayIsoDate(nineAmIst))).toBe('DUE_TODAY');
  });
});

describe('daysBetween', () => {
  it('is signed whole days', () => {
    expect(daysBetween('2026-10-25', '2026-10-28')).toBe(3);
    expect(daysBetween('2026-10-28', '2026-10-25')).toBe(-3);
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2); // across a DST change elsewhere
  });
});

describe('describeDue', () => {
  it.each([
    ['2026-10-25', 'Due today'],
    ['2026-10-26', 'Due tomorrow'],
    ['2026-10-28', 'Due in 3 days'],
    ['2026-10-24', 'Overdue by 1 day'],
    ['2026-10-19', 'Overdue by 6 days'],
  ])('%s → %s', (dueDate, text) => {
    expect(describeDue(dueDate, TODAY)).toBe(text);
  });
});

import { describe, expect, it } from 'vitest';
import { isOverdue } from './overdue';

const TODAY = '2026-10-25';

describe('isOverdue', () => {
  it('is not overdue on the due date itself', () => {
    expect(isOverdue({ status: 'PENDING', dueDate: TODAY }, TODAY)).toBe(false);
  });

  it('is overdue the day after the due date while pending', () => {
    expect(isOverdue({ status: 'PENDING', dueDate: '2026-10-24' }, TODAY)).toBe(true);
  });

  it('is overdue while changes are requested and the date has passed', () => {
    expect(isOverdue({ status: 'CHANGES_REQUESTED', dueDate: '2026-10-01' }, TODAY)).toBe(true);
  });

  it.each(['SUBMITTED', 'ACCEPTED'] as const)('is never overdue once %s', (status) => {
    expect(isOverdue({ status, dueDate: '2026-10-01' }, TODAY)).toBe(false);
  });

  it('compares across month and year boundaries', () => {
    expect(isOverdue({ status: 'PENDING', dueDate: '2025-12-31' }, '2026-01-01')).toBe(true);
    expect(isOverdue({ status: 'PENDING', dueDate: '2026-11-01' }, '2026-10-31')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { isValidIsoDate, todayIsoDate } from './dates';

describe('isValidIsoDate', () => {
  it.each(['2026-10-23', '2028-02-29', '2026-12-31'])('accepts %s', (value) => {
    expect(isValidIsoDate(value)).toBe(true);
  });

  it.each(['2026-02-30', '2027-02-29', '2026-13-01', '26-10-23', '2026/10/23', '', 'tomorrow'])(
    'rejects %s',
    (value) => {
      expect(isValidIsoDate(value)).toBe(false);
    },
  );
});

describe('todayIsoDate', () => {
  it('uses the UTC calendar date, not local time', () => {
    // 23:30 on 25 Oct in UTC is already 26 Oct in India; due dates follow UTC.
    expect(todayIsoDate(new Date('2026-10-25T23:30:00Z'))).toBe('2026-10-25');
  });
});

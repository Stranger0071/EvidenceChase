import { describe, expect, it } from 'vitest';
import { buildAuditSummary } from './summary';

describe('buildAuditSummary', () => {
  it('returns zeros for an audit with no requests', () => {
    expect(buildAuditSummary({}, 0)).toEqual({
      total: 0,
      pending: 0,
      submitted: 0,
      changesRequested: 0,
      accepted: 0,
      overdue: 0,
      percentComplete: 0,
    });
  });

  it('counts accepted requests towards completion', () => {
    const summary = buildAuditSummary({ PENDING: 1, SUBMITTED: 1, ACCEPTED: 2 }, 1);

    expect(summary).toMatchObject({ total: 4, accepted: 2, overdue: 1, percentComplete: 50 });
  });

  it('never rounds up to 100% before everything is accepted', () => {
    expect(buildAuditSummary({ PENDING: 1, ACCEPTED: 199 }, 0).percentComplete).toBe(99);
  });

  it('shows 100% when every request is accepted', () => {
    expect(buildAuditSummary({ ACCEPTED: 3 }, 0).percentComplete).toBe(100);
  });
});

import { describe, expect, it } from 'vitest';
import { buildAuditSummary, buildOwnerProgress } from './summary';

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

describe('buildOwnerProgress', () => {
  it('rolls status counts up per owner, most outstanding first', () => {
    const progress = buildOwnerProgress(
      [
        { ownerEmail: 'a@example.com', status: 'ACCEPTED', count: 3 },
        { ownerEmail: 'b@example.com', status: 'PENDING', count: 2 },
        { ownerEmail: 'b@example.com', status: 'CHANGES_REQUESTED', count: 1 },
        { ownerEmail: 'b@example.com', status: 'SUBMITTED', count: 1 },
        { ownerEmail: 'a@example.com', status: 'PENDING', count: 1 },
      ],
      new Map([['b@example.com', 2]]),
      new Map([['b@example.com', 'Bea']]),
    );

    expect(progress).toEqual([
      {
        ownerEmail: 'b@example.com',
        ownerName: 'Bea',
        total: 4,
        accepted: 0,
        inReview: 1,
        waiting: 3,
        overdue: 2,
      },
      {
        ownerEmail: 'a@example.com',
        ownerName: null,
        total: 4,
        accepted: 3,
        inReview: 0,
        waiting: 1,
        overdue: 0,
      },
    ]);
  });
});

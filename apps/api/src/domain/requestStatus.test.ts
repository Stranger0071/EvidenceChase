import { REQUEST_STATUSES, type RequestStatus } from '@evidencechase/shared';
import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, ValidationError } from '../errors';
import { transition, type Actor, type RequestAction } from './requestStatus';

const COMMENT = 'Screenshot must show the date';

/** Every (status, action) pair that is allowed, with the actor and the resulting status. */
const VALID: Array<[RequestStatus, RequestAction, Actor, RequestStatus]> = [
  ['PENDING', 'SUBMIT', 'OWNER', 'SUBMITTED'],
  ['CHANGES_REQUESTED', 'SUBMIT', 'OWNER', 'SUBMITTED'],
  ['SUBMITTED', 'SUBMIT', 'OWNER', 'SUBMITTED'],
  ['SUBMITTED', 'ACCEPT', 'MANAGER', 'ACCEPTED'],
  ['SUBMITTED', 'REQUEST_CHANGES', 'MANAGER', 'CHANGES_REQUESTED'],
  ['ACCEPTED', 'REOPEN', 'MANAGER', 'CHANGES_REQUESTED'],
  ['SUBMITTED', 'SCAN_FAILED', 'SYSTEM', 'CHANGES_REQUESTED'],
];

const ACTOR_FOR: Record<RequestAction, Actor> = {
  SUBMIT: 'OWNER',
  ACCEPT: 'MANAGER',
  REQUEST_CHANGES: 'MANAGER',
  REOPEN: 'MANAGER',
  SCAN_FAILED: 'SYSTEM',
};

describe('transition', () => {
  it.each(VALID)('%s --%s (%s)--> %s', (from, action, actor, to) => {
    expect(transition(from, action, actor, COMMENT)).toBe(to);
  });

  // Build the full matrix and check that every pair not listed above is refused.
  const invalid = REQUEST_STATUSES.flatMap((status) =>
    (Object.keys(ACTOR_FOR) as RequestAction[])
      .filter((action) => !VALID.some(([from, a]) => from === status && a === action))
      .map((action) => [status, action] as const),
  );

  it.each(invalid)('refuses %s --%s', (from, action) => {
    expect(() => transition(from, action, ACTOR_FOR[action], COMMENT)).toThrow(ConflictError);
  });

  it('refuses an owner accepting their own evidence', () => {
    expect(() => transition('SUBMITTED', 'ACCEPT', 'OWNER')).toThrow(ForbiddenError);
  });

  it('refuses a manager submitting on behalf of an owner', () => {
    expect(() => transition('PENDING', 'SUBMIT', 'MANAGER')).toThrow(ForbiddenError);
  });

  it.each([undefined, null, '', '    ', 'ok'])(
    'requires a real comment to request changes (%j)',
    (comment) => {
      expect(() => transition('SUBMITTED', 'REQUEST_CHANGES', 'MANAGER', comment)).toThrow(
        ValidationError,
      );
    },
  );

  it('requires a comment to re-open accepted evidence', () => {
    expect(() => transition('ACCEPTED', 'REOPEN', 'MANAGER')).toThrow(ValidationError);
  });

  it('does not need a comment for a failed malware scan', () => {
    expect(transition('SUBMITTED', 'SCAN_FAILED', 'SYSTEM')).toBe('CHANGES_REQUESTED');
  });
});

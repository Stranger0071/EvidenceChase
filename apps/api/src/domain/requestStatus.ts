import type { RequestStatus } from '@evidencechase/shared';
import { ConflictError, ForbiddenError, ValidationError } from '../errors';

/**
 * The evidence request state machine (PRD §7). Every status change in the system goes through
 * `transition()`, so the rules live in exactly one place and can be tested exhaustively.
 *
 *   PENDING ──SUBMIT──▶ SUBMITTED ──ACCEPT──▶ ACCEPTED
 *                        ▲    │                  │
 *                 SUBMIT │    │ REQUEST_CHANGES  │ REOPEN
 *                        │    ▼ or SCAN_FAILED   ▼
 *                    CHANGES_REQUESTED ◀─────────┘
 */
export type RequestAction = 'SUBMIT' | 'ACCEPT' | 'REQUEST_CHANGES' | 'REOPEN' | 'SCAN_FAILED';
export type Actor = 'MANAGER' | 'OWNER' | 'SYSTEM';

export const MIN_COMMENT_LENGTH = 5;

interface TransitionRule {
  from: readonly RequestStatus[];
  to: RequestStatus;
  actor: Actor;
  requiresComment: boolean;
}

const RULES: Record<RequestAction, TransitionRule> = {
  // Resubmitting while still SUBMITTED replaces the pending submission (FR-9).
  SUBMIT: {
    from: ['PENDING', 'CHANGES_REQUESTED', 'SUBMITTED'],
    to: 'SUBMITTED',
    actor: 'OWNER',
    requiresComment: false,
  },
  ACCEPT: { from: ['SUBMITTED'], to: 'ACCEPTED', actor: 'MANAGER', requiresComment: false },
  REQUEST_CHANGES: {
    from: ['SUBMITTED'],
    to: 'CHANGES_REQUESTED',
    actor: 'MANAGER',
    requiresComment: true,
  },
  // E.g. the auditor rejects evidence that was already accepted.
  REOPEN: { from: ['ACCEPTED'], to: 'CHANGES_REQUESTED', actor: 'MANAGER', requiresComment: true },
  // A file failed the malware scan, so the request goes back to the owner automatically.
  SCAN_FAILED: {
    from: ['SUBMITTED'],
    to: 'CHANGES_REQUESTED',
    actor: 'SYSTEM',
    requiresComment: false,
  },
};

const humanize = (value: string) => value.toLowerCase().replaceAll('_', ' ');

export class InvalidTransitionError extends ConflictError {
  constructor(current: RequestStatus, action: RequestAction) {
    super(`Can't ${humanize(action)} a request that is ${humanize(current)}`, 'INVALID_TRANSITION');
  }
}

/** Returns the next status, or throws if the action isn't allowed from the current state. */
export function transition(
  current: RequestStatus,
  action: RequestAction,
  actor: Actor,
  comment?: string | null,
): RequestStatus {
  const rule = RULES[action];

  if (rule.actor !== actor) {
    throw new ForbiddenError(`Only the ${rule.actor.toLowerCase()} can do that`);
  }
  if (!rule.from.includes(current)) {
    throw new InvalidTransitionError(current, action);
  }
  if (rule.requiresComment && (comment?.trim().length ?? 0) < MIN_COMMENT_LENGTH) {
    throw new ValidationError(
      `Add a comment of at least ${MIN_COMMENT_LENGTH} characters`,
      { comment: [`Must be at least ${MIN_COMMENT_LENGTH} characters`] },
      'COMMENT_REQUIRED',
    );
  }
  return rule.to;
}

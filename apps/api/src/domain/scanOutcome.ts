import type { ScanStatus } from '@evidencechase/shared';

/** The tag GuardDuty Malware Protection for S3 writes on each object it scans. */
export const GUARDDUTY_SCAN_TAG = 'GuardDutyMalwareScanStatus';

/** If GuardDuty hasn't tagged a file within this time, it's treated as a failed scan. */
export const SCAN_TIMEOUT_MINUTES = 30;

export type ScanDecision =
  | { kind: 'promote'; scanStatus: Extract<ScanStatus, 'NO_THREATS_FOUND' | 'NOT_SCANNED'> }
  | {
      kind: 'reject';
      scanStatus: Exclude<ScanStatus, 'NO_THREATS_FOUND' | 'NOT_SCANNED'>;
      reason: string;
    }
  | { kind: 'wait' };

/**
 * What to do with a quarantined file, given its scan tags (PRD §8.4, step 5). Pure, so every
 * outcome is unit-tested. Only an explicit "no threats found" lets a file out of quarantine.
 * Anything else, including a scan that never finishes, fails closed.
 */
export function decideScanOutcome(input: {
  scanningEnabled: boolean;
  tags: Record<string, string>;
  waitingMinutes: number;
}): ScanDecision {
  if (!input.scanningEnabled) return { kind: 'promote', scanStatus: 'NOT_SCANNED' };

  switch (input.tags[GUARDDUTY_SCAN_TAG]) {
    case 'NO_THREATS_FOUND':
      return { kind: 'promote', scanStatus: 'NO_THREATS_FOUND' };
    case 'THREATS_FOUND':
      return {
        kind: 'reject',
        scanStatus: 'THREATS_FOUND',
        reason: 'the malware scan found a threat in it',
      };
    case 'UNSUPPORTED':
      return {
        kind: 'reject',
        scanStatus: 'UNSUPPORTED',
        reason: "it couldn't be scanned (password-protected or encrypted files can't be checked)",
      };
    case 'ACCESS_DENIED':
    case 'FAILED':
      return {
        kind: 'reject',
        scanStatus: 'FAILED',
        reason: 'the malware scan failed, so please upload it again',
      };
    default:
      return input.waitingMinutes >= SCAN_TIMEOUT_MINUTES
        ? {
            kind: 'reject',
            scanStatus: 'FAILED',
            reason: "the malware scan didn't finish, so please upload it again",
          }
        : { kind: 'wait' };
  }
}

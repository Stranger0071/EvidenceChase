import { describe, expect, it } from 'vitest';
import { decideScanOutcome, GUARDDUTY_SCAN_TAG, SCAN_TIMEOUT_MINUTES } from './scanOutcome';

const scanned = (status: string | undefined, waitingMinutes = 1) =>
  decideScanOutcome({
    scanningEnabled: true,
    tags: status ? { [GUARDDUTY_SCAN_TAG]: status } : {},
    waitingMinutes,
  });

describe('decideScanOutcome', () => {
  it('promotes immediately when scanning is switched off', () => {
    expect(decideScanOutcome({ scanningEnabled: false, tags: {}, waitingMinutes: 0 })).toEqual({
      kind: 'promote',
      scanStatus: 'NOT_SCANNED',
    });
  });

  it('promotes a file GuardDuty found clean', () => {
    expect(scanned('NO_THREATS_FOUND')).toEqual({
      kind: 'promote',
      scanStatus: 'NO_THREATS_FOUND',
    });
  });

  it.each([
    ['THREATS_FOUND', 'THREATS_FOUND'],
    ['UNSUPPORTED', 'UNSUPPORTED'],
    ['ACCESS_DENIED', 'FAILED'],
    ['FAILED', 'FAILED'],
  ])('rejects a %s result', (tag, scanStatus) => {
    expect(scanned(tag)).toMatchObject({ kind: 'reject', scanStatus });
  });

  it('waits while the scan has not finished', () => {
    expect(scanned(undefined, SCAN_TIMEOUT_MINUTES - 1)).toEqual({ kind: 'wait' });
  });

  it('fails closed when the scan never finishes', () => {
    expect(scanned(undefined, SCAN_TIMEOUT_MINUTES)).toMatchObject({
      kind: 'reject',
      scanStatus: 'FAILED',
    });
  });

  it('fails closed on a tag value it does not recognise, once the timeout passes', () => {
    expect(scanned('SOMETHING_NEW', 1)).toEqual({ kind: 'wait' });
    expect(scanned('SOMETHING_NEW', SCAN_TIMEOUT_MINUTES)).toMatchObject({ kind: 'reject' });
  });
});

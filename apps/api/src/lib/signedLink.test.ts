import { describe, expect, it } from 'vitest';
import { signLink, verifyLink } from './signedLink';

const SECRET = 'export-signing-secret-for-tests-only-0123456789';
const NOW = new Date('2026-10-24T10:00:00Z');
const IN_A_MINUTE = new Date(NOW.getTime() + 60_000);

describe('signed links', () => {
  it('accepts an untouched link before it expires', () => {
    const { exp, sig } = signLink(SECRET, ['audit-1', 'accepted'], IN_A_MINUTE);
    expect(verifyLink(SECRET, ['audit-1', 'accepted'], exp, sig, NOW)).toBe('valid');
  });

  it('expires', () => {
    const { exp, sig } = signLink(SECRET, ['audit-1', 'accepted'], IN_A_MINUTE);
    expect(
      verifyLink(SECRET, ['audit-1', 'accepted'], exp, sig, new Date(IN_A_MINUTE.getTime() + 1000)),
    ).toBe('expired');
  });

  it.each([
    ['another audit', ['audit-2', 'accepted']],
    ['a wider scope', ['audit-1', 'all']],
  ])('breaks when pointed at %s', (_label, parts) => {
    const { exp, sig } = signLink(SECRET, ['audit-1', 'accepted'], IN_A_MINUTE);
    expect(verifyLink(SECRET, parts, exp, sig, NOW)).toBe('invalid');
  });

  it('breaks when the expiry is extended', () => {
    const { exp, sig } = signLink(SECRET, ['audit-1', 'accepted'], IN_A_MINUTE);
    expect(verifyLink(SECRET, ['audit-1', 'accepted'], String(Number(exp) + 3600), sig, NOW)).toBe(
      'invalid',
    );
  });

  it('rejects a different secret, junk and missing values', () => {
    const { exp, sig } = signLink(SECRET, ['audit-1', 'accepted'], IN_A_MINUTE);
    expect(
      verifyLink('another-secret-entirely-0123456789', ['audit-1', 'accepted'], exp, sig, NOW),
    ).toBe('invalid');
    expect(verifyLink(SECRET, ['audit-1', 'accepted'], exp, 'x', NOW)).toBe('invalid');
    expect(verifyLink(SECRET, ['audit-1', 'accepted'], undefined, sig, NOW)).toBe('invalid');
    expect(verifyLink(SECRET, ['audit-1', 'accepted'], '12abc', sig, NOW)).toBe('invalid');
  });
});

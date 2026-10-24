import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Short-lived signed links (HMAC-SHA256). The export download goes straight to the API rather
 * than through the web app's proxy, so the browser has no session cookie there. The signature,
 * which binds the audit, the scope and the expiry time, is the only credential. Changing any part
 * of it breaks the signature, and links stop working at `expiresAt`.
 */
export function signLink(
  secret: string,
  parts: string[],
  expiresAt: Date,
): { exp: string; sig: string } {
  const exp = String(Math.floor(expiresAt.getTime() / 1000));
  return { exp, sig: hmac(secret, [...parts, exp]) };
}

export type LinkCheck = 'valid' | 'expired' | 'invalid';

export function verifyLink(
  secret: string,
  parts: string[],
  exp: unknown,
  sig: unknown,
  now: Date,
): LinkCheck {
  if (typeof exp !== 'string' || typeof sig !== 'string' || !/^\d{1,12}$/.test(exp))
    return 'invalid';

  const expected = Buffer.from(hmac(secret, [...parts, exp]));
  const provided = Buffer.from(sig);
  // Check the signature first, so an attacker learns nothing from "expired" vs "invalid".
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return 'invalid';
  return Number(exp) * 1000 > now.getTime() ? 'valid' : 'expired';
}

function hmac(secret: string, parts: string[]): string {
  // A separator that can't appear in IDs, scopes or timestamps, so parts can't be shifted around.
  return createHmac('sha256', secret).update(parts.join('\n')).digest('base64url');
}

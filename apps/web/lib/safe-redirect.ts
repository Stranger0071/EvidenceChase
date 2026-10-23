/**
 * Where to go after signing in. Only same-site paths are allowed, so a crafted link like
 * /login?next=https://evil.example can't bounce someone off to another site (open redirect).
 */
export function safeNextPath(next: string | null, fallback = '/audits'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\'))
    return fallback;
  return next;
}

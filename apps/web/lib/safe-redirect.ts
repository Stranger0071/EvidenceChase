/**
 * Where to go after signing in. Only same-site paths are allowed, so a crafted link like
 * /login?next=https://evil.example can't bounce someone off to another site (open redirect).
 * The path is resolved the way the browser will resolve it, so tricks such as "//evil.example",
 * "/\evil.example" or a tab hidden in "/\t/evil.example" (browsers strip it) are caught too.
 */
export function safeNextPath(next: string | null, fallback = '/audits'): string {
  if (!next?.startsWith('/')) return fallback;
  const base = 'https://same-site.invalid';
  try {
    const url = new URL(next, base);
    return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}

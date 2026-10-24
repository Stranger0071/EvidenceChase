import type { NextConfig } from 'next';

// Where the Express API runs. In production this is the Render URL.
const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:4000';
// Where evidence files live. The browser uploads to it and loads image previews from it.
// Production: https://<bucket>.s3.<region>.amazonaws.com (the URL the S3 SDK signs).
const storageOrigin = process.env.STORAGE_ORIGIN ?? 'http://localhost:9000';
const isDev = process.env.NODE_ENV !== 'production';

/**
 * Content-Security-Policy (PRD §9.4). Scripts, styles and data only from this site, plus the S3
 * bucket for uploads and previews. Nothing may frame the app, and plugins and <base> tricks are off.
 * 'unsafe-inline' for scripts is what Next.js needs to hydrate pages without per-request nonces;
 * nonces would force every page to render dynamically. The other directives still block injected
 * scripts from loading anything from elsewhere or sending data off-site.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${storageOrigin}`,
  "font-src 'self' data:",
  `connect-src 'self' ${storageOrigin}${isDev ? ' ws:' : ''}`,
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Only when storage itself is HTTPS, so a local production build (http://localhost S3) still works.
  ...(storageOrigin.startsWith('https:') ? ['upgrade-insecure-requests'] : []),
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The shared package ships TypeScript source, so Next compiles it along with the app.
  transpilePackages: ['@evidencechase/shared'],
  // ESLint runs once for the whole monorepo (`pnpm lint`, and in CI), not again inside next build.
  eslint: { ignoreDuringBuilds: true },

  /**
   * Same-origin API proxy (PRD §8.1): the browser calls /api/* on this site, and Vercel forwards
   * it to Render. The session cookie is then first-party, so browsers that block third-party
   * cookies still keep people signed in, and the manager app needs no CORS.
   */
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiOrigin}/:path*` }];
  },

  // Security headers on every page (PRD §9.4).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Owner pages carry the magic-link token in their URL, so it must never leak as a Referer.
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
          // HTTPS only, for two years. Production only, so local http:// keeps working.
          ...(isDev
            ? []
            : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]),
        ],
      },
    ];
  },
};

export default nextConfig;

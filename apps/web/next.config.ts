import type { NextConfig } from 'next';

// Where the Express API runs. In production this is the Render URL.
const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:4000';

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

  // Baseline security headers. The full Content-Security-Policy arrives in Phase 7.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;

'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { ApiError } from '@/lib/api-client';

/**
 * A 401 in the manager app means the session expired: go to login, then come back afterwards.
 * Owner pages (/e/...) are excluded: owners have no account, and their link errors are shown
 * on the page itself.
 */
function redirectToLoginOn401(error: unknown) {
  if (!(error instanceof ApiError) || error.status !== 401) return;
  const { pathname, search } = window.location;
  const isOwnerPage = pathname === '/e' || pathname.startsWith('/e/');
  if (isOwnerPage || ['/login', '/signup'].some((prefix) => pathname.startsWith(prefix))) return;
  window.location.assign(`/login?next=${encodeURIComponent(pathname + search)}`);
}

/** Retry network failures and server errors, but never 4xx: retrying a 404 won't help. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: redirectToLoginOn401 }),
        mutationCache: new MutationCache({ onError: redirectToLoginOn401 }),
        defaultOptions: {
          queries: { retry: shouldRetry, staleTime: 30_000, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* Plain toasts (dark text on white, with icons): richColors fails WCAG contrast. */}
      <Toaster position="bottom-right" closeButton />
    </QueryClientProvider>
  );
}

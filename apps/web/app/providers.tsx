'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { ApiError } from '@/lib/api-client';

/** A 401 anywhere means the session expired: go to login, then come back here afterwards. */
function redirectToLoginOn401(error: unknown) {
  if (!(error instanceof ApiError) || error.status !== 401) return;
  const { pathname, search } = window.location;
  if (pathname.startsWith('/login') || pathname.startsWith('/signup')) return;
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
      <Toaster position="bottom-right" richColors closeButton />
    </QueryClientProvider>
  );
}

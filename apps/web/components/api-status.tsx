'use client';

import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

/** Small "API: up" indicator. It proves the /api rewrite to the backend works end to end. */
export function ApiStatus() {
  const { data, isPending } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const response = await fetch('/api/health');
      if (!response.ok) throw new Error('down');
      return (await response.json()) as { ok: boolean };
    },
    retry: false,
  });

  const state = isPending ? 'checking' : data?.ok ? 'up' : 'down';
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted" aria-live="polite">
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          state === 'up' && 'bg-success',
          state === 'down' && 'bg-danger',
          state === 'checking' && 'animate-pulse bg-muted',
        )}
        aria-hidden
      />
      API: {state}
    </span>
  );
}

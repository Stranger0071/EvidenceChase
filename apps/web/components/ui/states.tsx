'use client';

import { AlertTriangle } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { errorMessage } from '@/lib/api-client';
import { Button } from './button';

/**
 * Loading placeholder. The free Render API sleeps after 15 idle minutes and takes up to a minute
 * to wake, so after a few seconds we say so instead of leaving people staring at a spinner.
 */
export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="space-y-3 py-6" role="status" aria-live="polite">
      <div className="h-4 w-1/3 animate-pulse rounded bg-neutral-soft" />
      <div className="h-4 w-2/3 animate-pulse rounded bg-neutral-soft" />
      <div className="h-4 w-1/2 animate-pulse rounded bg-neutral-soft" />
      <p className="text-sm text-muted">
        {slow ? 'Waking up the server. This can take up to a minute on the free tier…' : label}
      </p>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-card border border-border bg-surface px-6 py-10 text-center"
      role="alert"
    >
      <AlertTriangle className="h-6 w-6 text-danger" aria-hidden />
      <p className="text-sm">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border bg-surface px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      <p className="max-w-md text-sm text-muted">{description}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

export interface BarSegment {
  key: string;
  label: string;
  value: number;
  /** A chart token class, e.g. "bg-chart-accepted". Marks only: text never uses these colours. */
  colorClass: string;
}

interface StackedBarProps {
  segments: BarSegment[];
  total: number;
  /** What the whole bar describes, for screen readers and the tooltip ("Rahul's requests"). */
  label: string;
  className?: string;
}

/**
 * One horizontal 100% bar split into segments. Each segment is a hover and focus target taller
 * than the mark, with a tooltip. Segments are separated by a 2px surface-colour gap rather than
 * outlines, and the whole bar has rounded ends.
 */
export function StackedBar({ segments, total, label, className }: StackedBarProps) {
  const [active, setActive] = useState<string | null>(null);
  const visible = segments.filter((segment) => segment.value > 0);
  const summary = visible
    .map((segment) => `${segment.value} ${segment.label.toLowerCase()}`)
    .join(', ');

  return (
    <div
      className={cn('relative', className)}
      role="img"
      aria-label={`${label}: ${summary || 'none yet'}`}
    >
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-chart-track">
        {visible.map((segment) => (
          <div
            key={segment.key}
            className={cn(
              'h-full transition-opacity',
              segment.colorClass,
              active && active !== segment.key && 'opacity-50',
            )}
            style={{ width: `${(segment.value / total) * 100}%` }}
          />
        ))}
      </div>

      {/* Hit targets: the full row height, wider than the 12px mark, laid over the bar. */}
      <div className="absolute inset-x-0 -inset-y-2 flex gap-[2px]" aria-hidden>
        {visible.map((segment) => (
          <div
            key={segment.key}
            className="relative h-full"
            style={{ width: `${(segment.value / total) * 100}%` }}
            onMouseEnter={() => setActive(segment.key)}
            onMouseLeave={() => setActive(null)}
          >
            {active === segment.key && (
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs whitespace-nowrap shadow-md">
                <span
                  className={cn(
                    'mr-1.5 inline-block h-2 w-2 rounded-full align-middle',
                    segment.colorClass,
                  )}
                />
                <span className="font-medium">{segment.value}</span>{' '}
                <span className="text-muted">
                  {segment.label.toLowerCase()} · {Math.round((segment.value / total) * 100)}%
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The legend: always present (identity never relies on colour alone), with each count. */
export function BarLegend({ segments }: { segments: BarSegment[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {segments.map((segment) => (
        <li key={segment.key} className="inline-flex items-center gap-1.5">
          <span className={cn('h-2.5 w-2.5 rounded-full', segment.colorClass)} aria-hidden />
          <span className="text-muted">{segment.label}</span>
          <span className="font-medium tabular-nums">{segment.value}</span>
        </li>
      ))}
    </ul>
  );
}

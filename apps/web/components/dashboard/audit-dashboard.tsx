'use client';

import type { AuditDashboardDto, OverdueRequestDto } from '@evidencechase/shared';
import { AlertTriangle, Loader2, Table2, BarChart3 } from 'lucide-react';
import { useState } from 'react';
import { StatusBadge } from '@/components/requests/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { useDashboard } from '@/hooks/use-audits';
import { formatDate } from '@/lib/utils';
import { BarLegend, StackedBar, type BarSegment } from './stacked-bar';

function statusSegments({ summary }: AuditDashboardDto): BarSegment[] {
  return [
    {
      key: 'accepted',
      label: 'Accepted',
      value: summary.accepted,
      colorClass: 'bg-chart-accepted',
    },
    { key: 'review', label: 'In review', value: summary.submitted, colorClass: 'bg-chart-review' },
    {
      key: 'changes',
      label: 'Changes requested',
      value: summary.changesRequested,
      colorClass: 'bg-chart-changes',
    },
    {
      key: 'waiting',
      label: 'Not submitted',
      value: summary.pending,
      colorClass: 'bg-chart-waiting',
    },
  ];
}

function ownerSegments(owner: AuditDashboardDto['owners'][number]): BarSegment[] {
  return [
    { key: 'accepted', label: 'Accepted', value: owner.accepted, colorClass: 'bg-chart-accepted' },
    { key: 'review', label: 'In review', value: owner.inReview, colorClass: 'bg-chart-review' },
    { key: 'waiting', label: 'Still owed', value: owner.waiting, colorClass: 'bg-chart-waiting' },
  ];
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'danger' }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={
          tone === 'danger' && value > 0
            ? 'text-2xl font-semibold text-danger'
            : 'text-2xl font-semibold'
        }
      >
        {value}
      </p>
    </div>
  );
}

/** The chart data as plain tables, for screen readers, print, and anyone who'd rather read numbers. */
function DashboardTables({ dashboard }: { dashboard: AuditDashboardDto }) {
  return (
    <div className="space-y-4 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="mb-1 text-left text-xs text-muted">Requests by status</caption>
        <thead className="text-xs text-muted">
          <tr>
            <th className="py-1 pr-4 font-medium">Status</th>
            <th className="py-1 font-medium">Requests</th>
          </tr>
        </thead>
        <tbody>
          {statusSegments(dashboard).map((segment) => (
            <tr key={segment.key} className="border-t border-border">
              <td className="py-1 pr-4">{segment.label}</td>
              <td className="py-1 tabular-nums">{segment.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="w-full text-left text-sm">
        <caption className="mb-1 text-left text-xs text-muted">Progress by owner</caption>
        <thead className="text-xs text-muted">
          <tr>
            {['Owner', 'Total', 'Accepted', 'In review', 'Still owed', 'Overdue'].map((heading) => (
              <th key={heading} className="py-1 pr-4 font-medium">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dashboard.owners.map((owner) => (
            <tr key={owner.ownerEmail} className="border-t border-border tabular-nums">
              <td className="py-1 pr-4">{owner.ownerName ?? owner.ownerEmail}</td>
              <td className="py-1 pr-4">{owner.total}</td>
              <td className="py-1 pr-4">{owner.accepted}</td>
              <td className="py-1 pr-4">{owner.inReview}</td>
              <td className="py-1 pr-4">{owner.waiting}</td>
              <td className="py-1 pr-4">{owner.overdue}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OverdueList({
  items,
  onOpen,
}: {
  items: OverdueRequestDto[];
  onOpen: (requestId: string) => void;
}) {
  return (
    <ul className="divide-y divide-border">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
          <span className="font-mono text-xs">{item.controlRef}</span>
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:text-primary hover:underline"
            onClick={() => onOpen(item.id)}
          >
            {item.title}
          </button>
          <span className="text-sm text-muted">{item.ownerName ?? item.ownerEmail}</span>
          <StatusBadge status={item.status} />
          <span className="text-sm font-medium text-danger">
            {item.daysOverdue} day{item.daysOverdue === 1 ? '' : 's'} late
          </span>
          <span className="sr-only">due {formatDate(item.dueDate)}</span>
        </li>
      ))}
    </ul>
  );
}

/** "Are we ready for the auditor?" at a glance (Phase 6). */
export function AuditDashboard({
  auditId,
  onOpenRequest,
}: {
  auditId: string;
  onOpenRequest: (requestId: string) => void;
}) {
  const dashboard = useDashboard(auditId);
  const [asTable, setAsTable] = useState(false);

  if (dashboard.isPending) return <LoadingState label="Loading dashboard…" />;
  if (dashboard.isError)
    return <ErrorState error={dashboard.error} onRetry={() => dashboard.refetch()} />;

  const data = dashboard.data;
  const { summary } = data;
  if (summary.total === 0) return null;

  return (
    <Card className="space-y-6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Ready for the auditor</p>
          <p className="text-4xl font-semibold tabular-nums">{summary.percentComplete}%</p>
          <p className="text-sm text-muted">
            {summary.accepted} of {summary.total} requests accepted
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAsTable((value) => !value)}
          aria-pressed={asTable}
        >
          {asTable ? (
            <BarChart3 className="h-4 w-4" aria-hidden />
          ) : (
            <Table2 className="h-4 w-4" aria-hidden />
          )}
          {asTable ? 'Show charts' : 'Show as table'}
        </Button>
      </div>

      {asTable ? (
        <DashboardTables dashboard={data} />
      ) : (
        <>
          <div className="space-y-3">
            <StackedBar
              segments={statusSegments(data)}
              total={summary.total}
              label="Requests by status"
            />
            <BarLegend segments={statusSegments(data)} />
          </div>

          {data.owners.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Progress by owner</h3>
              <BarLegend
                segments={ownerSegments(data.owners[0]!).map((segment) => ({
                  ...segment,
                  value: sumOwners(data, segment.key),
                }))}
              />
              <ul className="space-y-3">
                {data.owners.map((owner) => (
                  <li
                    key={owner.ownerEmail}
                    className="grid grid-cols-1 items-center gap-1 sm:grid-cols-[minmax(0,12rem)_1fr_auto] sm:gap-3"
                  >
                    <span className="truncate text-sm" title={owner.ownerEmail}>
                      {owner.ownerName ?? owner.ownerEmail}
                    </span>
                    <StackedBar
                      segments={ownerSegments(owner)}
                      total={owner.total}
                      label={`${owner.ownerName ?? owner.ownerEmail}'s requests`}
                    />
                    <span className="text-xs whitespace-nowrap text-muted tabular-nums">
                      {owner.accepted}/{owner.total} accepted
                      {owner.overdue > 0 && (
                        <span className="ml-2 font-medium text-danger">
                          {owner.overdue} overdue
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Overdue" value={summary.overdue} tone="danger" />
        <Stat label="Waiting for your review" value={summary.submitted} />
        <Stat label="Sent back to owners" value={summary.changesRequested} />
        <Stat label="Not submitted yet" value={summary.pending} />
      </div>

      {data.filesScanning > 0 && (
        <p className="inline-flex items-center gap-2 text-sm text-muted" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {data.filesScanning} file{data.filesScanning === 1 ? ' is' : 's are'} being checked for
          malware
        </p>
      )}

      {data.overdue.length > 0 && (
        <section className="space-y-1">
          <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 text-danger" aria-hidden />
            Most overdue
          </h3>
          <OverdueList items={data.overdue} onOpen={onOpenRequest} />
        </section>
      )}
    </Card>
  );
}

/** Totals across owners for one segment, so the owner legend shows audit-wide counts. */
function sumOwners(data: AuditDashboardDto, key: string): number {
  return data.owners.reduce((total, owner) => {
    const segment = ownerSegments(owner).find((item) => item.key === key);
    return total + (segment?.value ?? 0);
  }, 0);
}

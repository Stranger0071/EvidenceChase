import type { AuditSummary as Summary } from '@evidencechase/shared';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ProgressBar } from './progress-bar';

/** "Are we ready for the auditor?" at a glance. */
export function AuditSummary({ summary }: { summary: Summary }) {
  const stats = [
    { label: 'Pending', value: summary.pending },
    { label: 'Submitted', value: summary.submitted },
    { label: 'Changes requested', value: summary.changesRequested },
    { label: 'Accepted', value: summary.accepted },
    { label: 'Overdue', value: summary.overdue, alert: summary.overdue > 0 },
  ];

  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between">
        <p className="text-sm text-muted">Readiness</p>
        <p className="text-2xl font-semibold">{summary.percentComplete}%</p>
      </div>
      <div className="mt-2">
        <ProgressBar percent={summary.percentComplete} label="Audit readiness" />
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-5">
        {stats.map(({ label, value, alert }) => (
          <div key={label}>
            <dt className="text-xs text-muted">{label}</dt>
            <dd className={cn('text-xl font-semibold', alert && 'text-danger')}>{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

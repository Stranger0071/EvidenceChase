import { FRAMEWORK_LABELS, type AuditDto } from '@evidencechase/shared';
import { CalendarDays } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';
import { ProgressBar } from './progress-bar';

export function AuditCard({ audit }: { audit: AuditDto }) {
  const { summary } = audit;
  return (
    <Link
      href={`/audits/${audit.id}`}
      className="block rounded-card border border-border bg-surface p-5 transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-semibold">{audit.name}</h2>
        {audit.archivedAt ? (
          <Badge>Archived</Badge>
        ) : (
          <Badge tone="info">{FRAMEWORK_LABELS[audit.framework]}</Badge>
        )}
      </div>

      {audit.auditDate && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted">
          <CalendarDays className="h-4 w-4" aria-hidden />
          Auditor date {formatDate(audit.auditDate)}
        </p>
      )}

      <div className="mt-5 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted">
            {summary.accepted} of {summary.total} accepted
          </span>
          <span className="font-medium">{summary.percentComplete}%</span>
        </div>
        <ProgressBar percent={summary.percentComplete} label={`${audit.name} completion`} />
      </div>

      {summary.overdue > 0 && (
        <p className="mt-3 text-sm font-medium text-danger">{summary.overdue} overdue</p>
      )}
    </Link>
  );
}

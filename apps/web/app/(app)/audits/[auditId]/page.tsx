'use client';

import { FRAMEWORK_LABELS, type EvidenceRequestDto } from '@evidencechase/shared';
import { Archive, ArrowLeft, CalendarDays, FileUp, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { AuditFormDialog } from '@/components/audits/audit-form-dialog';
import { AuditSummary } from '@/components/audits/audit-summary';
import { CsvImportDialog } from '@/components/requests/csv-import-dialog';
import { RequestFormDialog } from '@/components/requests/request-form-dialog';
import { RequestsTable } from '@/components/requests/requests-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { useArchiveAudit, useAudit } from '@/hooks/use-audits';
import { useDeleteRequest, useRequests } from '@/hooks/use-requests';
import { errorMessage } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';

/** Which dialog is open. Only one at a time, so a single piece of state is enough. */
type OpenDialog =
  | { kind: 'editAudit' }
  | { kind: 'archive' }
  | { kind: 'import' }
  | { kind: 'request'; request?: EvidenceRequestDto }
  | { kind: 'deleteRequest'; request: EvidenceRequestDto }
  | null;

export default function AuditDetailPage() {
  const { auditId } = useParams<{ auditId: string }>();
  const audit = useAudit(auditId);
  const requests = useRequests(auditId);
  const archiveAudit = useArchiveAudit(auditId);
  const deleteRequest = useDeleteRequest(auditId);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const closeDialog = () => setDialog(null);

  const onEdit = useCallback(
    (request: EvidenceRequestDto) => setDialog({ kind: 'request', request }),
    [],
  );
  const onDelete = useCallback(
    (request: EvidenceRequestDto) => setDialog({ kind: 'deleteRequest', request }),
    [],
  );

  if (audit.isPending) return <LoadingState label="Loading audit…" />;
  if (audit.isError) {
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorState error={audit.error} onRetry={() => audit.refetch()} />
      </div>
    );
  }

  const isArchived = audit.data.archivedAt !== null;

  return (
    <div className="space-y-6">
      <BackLink />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{audit.data.name}</h1>
            <Badge tone="info">{FRAMEWORK_LABELS[audit.data.framework]}</Badge>
            {isArchived && <Badge>Archived</Badge>}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            {audit.data.auditDate && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" aria-hidden />
                Auditor date {formatDate(audit.data.auditDate)}
              </span>
            )}
            <span>Reminders {audit.data.remindersOn ? 'on' : 'off'}</span>
          </p>
        </div>

        {!isArchived && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setDialog({ kind: 'editAudit' })}>
              <Pencil className="h-4 w-4" aria-hidden />
              Edit
            </Button>
            <Button variant="secondary" onClick={() => setDialog({ kind: 'archive' })}>
              <Archive className="h-4 w-4" aria-hidden />
              Archive
            </Button>
          </div>
        )}
      </div>

      <AuditSummary summary={audit.data.summary} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Evidence requests</h2>
          {!isArchived && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setDialog({ kind: 'import' })}>
                <FileUp className="h-4 w-4" aria-hidden />
                Import CSV
              </Button>
              <Button onClick={() => setDialog({ kind: 'request' })}>
                <Plus className="h-4 w-4" aria-hidden />
                Add request
              </Button>
            </div>
          )}
        </div>

        {requests.isPending ? (
          <LoadingState label="Loading requests…" />
        ) : requests.isError ? (
          <ErrorState error={requests.error} onRetry={() => requests.refetch()} />
        ) : requests.data.length === 0 ? (
          <EmptyState
            title="No evidence requests yet"
            description="Add what you need from each control owner one at a time, or import them all at once from a CSV."
            action={
              !isArchived && (
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setDialog({ kind: 'import' })}>
                    Import CSV
                  </Button>
                  <Button onClick={() => setDialog({ kind: 'request' })}>Add request</Button>
                </div>
              )
            }
          />
        ) : (
          <RequestsTable
            requests={requests.data}
            readOnly={isArchived}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        )}
      </section>

      <AuditFormDialog
        open={dialog?.kind === 'editAudit'}
        onOpenChange={closeDialog}
        audit={audit.data}
      />
      <CsvImportDialog
        auditId={auditId}
        open={dialog?.kind === 'import'}
        onOpenChange={closeDialog}
      />
      <RequestFormDialog
        auditId={auditId}
        open={dialog?.kind === 'request'}
        onOpenChange={closeDialog}
        request={dialog?.kind === 'request' ? dialog.request : undefined}
      />
      <ConfirmDialog
        open={dialog?.kind === 'archive'}
        onOpenChange={closeDialog}
        title="Archive this audit?"
        description="It becomes read-only: no new requests, no edits, and no reminders. Evidence is kept."
        confirmLabel="Archive audit"
        loading={archiveAudit.isPending}
        onConfirm={() =>
          archiveAudit.mutate(undefined, {
            onSuccess: () => {
              closeDialog();
              toast.success('Audit archived');
            },
            onError: (error) => toast.error(errorMessage(error)),
          })
        }
      />
      <ConfirmDialog
        open={dialog?.kind === 'deleteRequest'}
        onOpenChange={closeDialog}
        title="Delete this request?"
        description={
          dialog?.kind === 'deleteRequest'
            ? `${dialog.request.controlRef} · ${dialog.request.title} will be removed. This can't be undone.`
            : ''
        }
        confirmLabel="Delete request"
        destructive
        loading={deleteRequest.isPending}
        onConfirm={() => {
          if (dialog?.kind !== 'deleteRequest') return;
          deleteRequest.mutate(dialog.request.id, {
            onSuccess: () => {
              closeDialog();
              toast.success('Request deleted');
            },
            onError: (error) => toast.error(errorMessage(error)),
          });
        }}
      />
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/audits"
      className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      All audits
    </Link>
  );
}

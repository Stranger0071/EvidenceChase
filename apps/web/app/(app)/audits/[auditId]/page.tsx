'use client';

import { FRAMEWORK_LABELS, type EvidenceRequestDto } from '@evidencechase/shared';
import {
  Archive,
  ArrowLeft,
  CalendarDays,
  Download,
  FileUp,
  Pencil,
  Plus,
  Send,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { AuditFormDialog } from '@/components/audits/audit-form-dialog';
import { ExportDialog } from '@/components/audits/export-dialog';
import { AuditDashboard } from '@/components/dashboard/audit-dashboard';
import { CsvImportDialog } from '@/components/requests/csv-import-dialog';
import { RequestFormDialog } from '@/components/requests/request-form-dialog';
import { RequestReviewDialog } from '@/components/requests/request-review-dialog';
import { RequestsTable } from '@/components/requests/requests-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { useArchiveAudit, useAudit } from '@/hooks/use-audits';
import { useDeleteRequest, useRequests } from '@/hooks/use-requests';
import { useCopyLink, useSendRequests } from '@/hooks/use-review';
import { errorMessage } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';

/** Which dialog is open. Only one at a time, so a single piece of state is enough. */
type OpenDialog =
  | { kind: 'editAudit' }
  | { kind: 'archive' }
  | { kind: 'import' }
  | { kind: 'request'; request?: EvidenceRequestDto }
  | { kind: 'deleteRequest'; request: EvidenceRequestDto }
  | { kind: 'send' }
  | { kind: 'export' }
  /** By ID, so the dialog always shows the latest version of the request from the list. */
  | { kind: 'review'; requestId: string }
  | null;

export default function AuditDetailPage() {
  const { auditId } = useParams<{ auditId: string }>();
  const audit = useAudit(auditId);
  const requests = useRequests(auditId);
  const archiveAudit = useArchiveAudit(auditId);
  const deleteRequest = useDeleteRequest(auditId);
  const sendRequests = useSendRequests(auditId);
  const copyLink = useCopyLink(auditId);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const closeDialog = () => setDialog(null);

  const onReview = useCallback(
    (request: EvidenceRequestDto) => setDialog({ kind: 'review', requestId: request.id }),
    [],
  );
  const { mutate: issueLink } = copyLink;
  const onCopyLink = useCallback(
    (request: EvidenceRequestDto) =>
      issueLink(request.id, {
        onSuccess: async ({ url }) => {
          try {
            await navigator.clipboard.writeText(url);
            toast.success(`Upload link for ${request.controlRef} copied. It works for 30 days.`);
          } catch {
            // Clipboard access can be blocked; show the link so it can be copied by hand.
            toast.info(url, { duration: 30_000 });
          }
        },
        onError: (error) => toast.error(errorMessage(error)),
      }),
    [issueLink],
  );

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

        <div className="flex flex-wrap gap-2">
          {!isArchived && (
            <Button onClick={() => setDialog({ kind: 'send' })}>
              <Send className="h-4 w-4" aria-hidden />
              Send requests
            </Button>
          )}
          {/* Export stays available once archived: that's when the pack is handed over. */}
          <Button variant="secondary" onClick={() => setDialog({ kind: 'export' })}>
            <Download className="h-4 w-4" aria-hidden />
            Export
          </Button>
          {!isArchived && (
            <>
              <Button variant="secondary" onClick={() => setDialog({ kind: 'editAudit' })}>
                <Pencil className="h-4 w-4" aria-hidden />
                Edit
              </Button>
              <Button variant="secondary" onClick={() => setDialog({ kind: 'archive' })}>
                <Archive className="h-4 w-4" aria-hidden />
                Archive
              </Button>
            </>
          )}
        </div>
      </div>

      <AuditDashboard
        auditId={auditId}
        onOpenRequest={(requestId) => setDialog({ kind: 'review', requestId })}
      />

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
            onReview={onReview}
            onCopyLink={onCopyLink}
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
      <ExportDialog auditId={auditId} open={dialog?.kind === 'export'} onOpenChange={closeDialog} />
      <RequestReviewDialog
        request={
          dialog?.kind === 'review'
            ? (requests.data?.find((request) => request.id === dialog.requestId) ?? null)
            : null
        }
        readOnly={isArchived}
        onOpenChange={closeDialog}
      />
      <ConfirmDialog
        open={dialog?.kind === 'send'}
        onOpenChange={closeDialog}
        title="Send evidence requests?"
        description="Every owner who still owes evidence gets one email listing all of their requests, each with its own secure upload link. Owners who already submitted are skipped."
        confirmLabel="Send emails"
        loading={sendRequests.isPending}
        onConfirm={() =>
          sendRequests.mutate(undefined, {
            onSuccess: ({ emailsSent, requestsIncluded, failedRecipients }) => {
              closeDialog();
              toast.success(
                `Sent ${emailsSent} email${emailsSent === 1 ? '' : 's'} covering ${requestsIncluded} request${requestsIncluded === 1 ? '' : 's'}`,
              );
              if (failedRecipients.length > 0) {
                toast.error(
                  `Couldn't email ${failedRecipients.join(', ')}. Use "Copy link" to send their links another way.`,
                  { duration: 15_000 },
                );
              }
            },
            onError: (error) => toast.error(errorMessage(error)),
          })
        }
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

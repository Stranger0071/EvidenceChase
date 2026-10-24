'use client';

import type { ActivityLogDto, EvidenceFileDto, EvidenceRequestDto } from '@evidencechase/shared';
import { BellRing, Check, Download, Eye, RotateCcw, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { SubmissionFiles } from '@/components/evidence/submission-files';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { useFileUrl, useNudge, useReview, useSubmissions, useTimeline } from '@/hooks/use-review';
import { errorMessage } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import { StatusBadge } from './status-badge';

const ACTION_LABELS: Record<string, string> = {
  SUBMITTED: 'submitted evidence',
  ACCEPT: 'accepted the evidence',
  REQUEST_CHANGES: 'requested changes',
  REOPEN: 're-opened accepted evidence',
  SCAN_FAILED: 'sent it back automatically: a file failed the malware scan',
  FILE_REJECTED: 'rejected a file',
  DOWNLOADED: 'downloaded',
  PREVIEWED: 'previewed',
  REMINDER_SENT: 'sent a reminder',
  NUDGED: 'sent a reminder (nudge)',
};

function TimelineEntry({ entry }: { entry: ActivityLogDto }) {
  const actor =
    entry.actorType === 'SYSTEM'
      ? 'EvidenceChase'
      : (entry.actorEmail ?? entry.actorType.toLowerCase());
  const isFileEvent = entry.action === 'DOWNLOADED' || entry.action === 'PREVIEWED';
  return (
    <li className="border-l-2 border-border pb-3 pl-3 last:pb-0">
      <p className="text-sm">
        <span className="font-medium">{actor}</span>{' '}
        {ACTION_LABELS[entry.action] ?? entry.action.toLowerCase()}
        {isFileEvent && entry.comment && <> {entry.comment}</>}
      </p>
      {!isFileEvent && entry.comment && (
        <p className="mt-0.5 text-sm whitespace-pre-line text-muted">{entry.comment}</p>
      )}
      <p className="text-xs text-muted">{new Date(entry.createdAt).toLocaleString()}</p>
    </li>
  );
}

interface RequestReviewDialogProps {
  request: EvidenceRequestDto | null;
  readOnly: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RequestReviewDialog({ request, readOnly, onOpenChange }: RequestReviewDialogProps) {
  return (
    <Dialog
      open={request !== null}
      onOpenChange={onOpenChange}
      title={request ? `${request.controlRef} · ${request.title}` : 'Review'}
      className="max-w-3xl"
    >
      {/* Keyed by request, so the comment box and preview reset when switching requests. */}
      {request && <ReviewBody key={request.id} request={request} readOnly={readOnly} />}
    </Dialog>
  );
}

function ReviewBody({ request, readOnly }: { request: EvidenceRequestDto; readOnly: boolean }) {
  const submissions = useSubmissions(request.id);
  const timeline = useTimeline(request.id);
  const review = useReview(request.id);
  const fileUrl = useFileUrl();
  const nudge = useNudge(request.auditId);
  const waitingOnOwner = request.status === 'PENDING' || request.status === 'CHANGES_REQUESTED';
  const [mode, setMode] = useState<'changes' | 'reopen' | null>(null);
  const [comment, setComment] = useState('');
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);

  const [current, ...older] = submissions.data ?? [];
  const scanning = current?.files.some((file) => file.state === 'AWAITING_SCAN') ?? false;

  const act = (action: 'ACCEPT' | 'REQUEST_CHANGES' | 'REOPEN') =>
    review.mutate(
      { action, comment: action === 'ACCEPT' ? undefined : comment, version: request.version },
      {
        onSuccess: (updated) => {
          toast.success(
            updated.status === 'ACCEPTED'
              ? 'Evidence accepted'
              : 'Sent back to the owner with your comment',
          );
          setMode(null);
          setComment('');
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );

  const openFile = (file: EvidenceFileDto, inline: boolean) => {
    // Opened synchronously on click so the browser doesn't block it as a pop-up; filled in once
    // the short-lived link arrives. PDFs open in their own tab, on S3's origin, not ours.
    const tab = inline && !file.contentType.startsWith('image/') ? window.open('', '_blank') : null;
    if (tab) tab.opener = null;
    fileUrl.mutate(
      { fileId: file.id, inline, requestId: request.id },
      {
        onSuccess: ({ url }) => {
          if (!inline) window.location.assign(url);
          else if (tab) tab.location.href = url;
          else setPreview({ url, name: file.originalName });
        },
        onError: (error) => {
          tab?.close();
          toast.error(errorMessage(error));
        },
      },
    );
  };

  const fileActions = (file: EvidenceFileDto) =>
    file.state === 'VERIFIED' && (
      <div className="flex gap-1">
        {file.previewable && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openFile(file, true)}
            aria-label={`Preview ${file.originalName}`}
          >
            <Eye className="h-4 w-4" aria-hidden />
            Preview
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => openFile(file, false)}
          aria-label={`Download ${file.originalName}`}
        >
          <Download className="h-4 w-4" aria-hidden />
          Download
        </Button>
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <StatusBadge status={request.status} />
        <span className="text-muted">
          {request.ownerName ? `${request.ownerName} · ` : ''}
          {request.ownerEmail}
        </span>
        <span className="text-muted">Due {formatDate(request.dueDate)}</span>
      </div>

      <section className="space-y-2">
        <h3 className="font-semibold">Current evidence</h3>
        {submissions.isPending ? (
          <LoadingState label="Loading evidence…" />
        ) : submissions.isError ? (
          <ErrorState error={submissions.error} onRetry={() => submissions.refetch()} />
        ) : !current ? (
          <p className="text-sm text-muted">Nothing submitted yet.</p>
        ) : (
          <>
            <p className="text-sm text-muted">
              Submitted {new Date(current.submittedAt).toLocaleString()}
              {current.note && <> · &ldquo;{current.note}&rdquo;</>}
            </p>
            <SubmissionFiles files={current.files} actions={fileActions} />
          </>
        )}
        {preview && (
          <figure className="space-y-2 rounded-lg border border-border p-3">
            {/* A plain img: a short-lived S3 link, not an asset for next/image to optimise. */}
            <img
              src={preview.url}
              alt={preview.name}
              className="mx-auto max-h-96 rounded"
              referrerPolicy="no-referrer"
            />
            <figcaption className="flex items-center justify-between text-xs text-muted">
              {preview.name}
              <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>
                Close preview
              </Button>
            </figcaption>
          </figure>
        )}
      </section>

      {!readOnly && waitingOnOwner && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-background p-4">
          <p className="text-sm text-muted">
            Waiting on {request.ownerName ?? request.ownerEmail}. Reminders go out automatically;
            nudge to send one now (at most one reminder a day).
          </p>
          <Button
            variant="secondary"
            loading={nudge.isPending}
            onClick={() =>
              nudge.mutate(request.id, {
                onSuccess: () => toast.success(`Reminder sent to ${request.ownerEmail}`),
                onError: (error) => toast.error(errorMessage(error)),
              })
            }
          >
            <BellRing className="h-4 w-4" aria-hidden />
            Nudge now
          </Button>
        </section>
      )}

      {!readOnly && (request.status === 'SUBMITTED' || request.status === 'ACCEPTED') && (
        <section className="space-y-3 rounded-card border border-border bg-background p-4">
          {mode ? (
            <>
              <Field
                id="review-comment"
                label={
                  mode === 'changes' ? 'What needs to change?' : 'Why is this being re-opened?'
                }
                hint="The owner sees this comment in their email and on their upload page."
              >
                <Textarea
                  id="review-comment"
                  value={comment}
                  maxLength={2000}
                  autoFocus
                  placeholder="The screenshot must show the date. Please re-capture."
                  onChange={(event) => setComment(event.target.value)}
                />
              </Field>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setMode(null)}
                  disabled={review.isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => act(mode === 'changes' ? 'REQUEST_CHANGES' : 'REOPEN')}
                  disabled={comment.trim().length < 5}
                  loading={review.isPending}
                >
                  Send to owner
                </Button>
              </div>
            </>
          ) : request.status === 'SUBMITTED' ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">
                {scanning
                  ? "Files are still being checked for malware. You can accept once they're clear."
                  : 'Is this evidence acceptable?'}
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setMode('changes')}>
                  <Undo2 className="h-4 w-4" aria-hidden />
                  Request changes
                </Button>
                <Button
                  onClick={() => act('ACCEPT')}
                  disabled={scanning || !current}
                  loading={review.isPending}
                >
                  <Check className="h-4 w-4" aria-hidden />
                  Accept
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">
                Accepted. Re-open it if the auditor needs something different.
              </p>
              <Button variant="secondary" onClick={() => setMode('reopen')}>
                <RotateCcw className="h-4 w-4" aria-hidden />
                Re-open
              </Button>
            </div>
          )}
        </section>
      )}

      {older.length > 0 && (
        <details className="rounded-card border border-border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Earlier submissions ({older.length})
          </summary>
          <div className="mt-3 space-y-4">
            {older.map((submission) => (
              <div key={submission.id} className="space-y-1">
                <p className="text-xs text-muted">
                  {new Date(submission.submittedAt).toLocaleString()}
                </p>
                <SubmissionFiles files={submission.files} actions={fileActions} />
              </div>
            ))}
          </div>
        </details>
      )}

      <section className="space-y-2">
        <h3 className="font-semibold">Activity</h3>
        {timeline.isPending ? (
          <LoadingState label="Loading activity…" />
        ) : timeline.isError ? (
          <ErrorState error={timeline.error} onRetry={() => timeline.refetch()} />
        ) : timeline.data.length === 0 ? (
          <p className="text-sm text-muted">No activity yet.</p>
        ) : (
          <ol className="space-y-0">
            {timeline.data.map((entry) => (
              <TimelineEntry key={entry.id} entry={entry} />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

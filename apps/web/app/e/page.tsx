'use client';

import type { OwnerPortalDto } from '@evidencechase/shared';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarDays, CheckCircle2, Clock, LinkIcon, MessageSquareWarning } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import { SubmissionFiles } from '@/components/evidence/submission-files';
import { EvidenceDropzone } from '@/components/owner/evidence-dropzone';
import { StatusBadge } from '@/components/requests/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { LoadingState } from '@/components/ui/states';
import { useEvidenceUpload } from '@/hooks/use-evidence-upload';
import { useOwnerPortal } from '@/hooks/use-owner-portal';
import { ApiError, errorMessage } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatDate } from '@/lib/utils';

const LINK_ERRORS: Record<string, { title: string; body: string }> = {
  LINK_INVALID: {
    title: "This link isn't valid",
    body: 'Check that you opened the full link from your email. If it still fails, ask your compliance manager for a new one.',
  },
  LINK_REVOKED: {
    title: 'This link has been replaced',
    body: 'The request was reassigned or a newer link was sent. Ask your compliance manager for the current link.',
  },
  LINK_EXPIRED: {
    title: 'This link has expired',
    body: 'Links last 30 days. Ask your compliance manager to send you a new one.',
  },
};

function LinkProblem({ error }: { error: unknown }) {
  const known = error instanceof ApiError ? LINK_ERRORS[error.code] : undefined;
  return (
    <Card className="p-8 text-center">
      <LinkIcon className="mx-auto h-6 w-6 text-muted" aria-hidden />
      <h1 className="mt-3 text-lg font-semibold">
        {known?.title ?? "We couldn't load this request"}
      </h1>
      <p className="mt-2 text-sm text-muted">{known?.body ?? errorMessage(error)}</p>
    </Card>
  );
}

/** What the owner needs to know right now, depending on the request's state. */
function StatusMessage({ portal }: { portal: OwnerPortalDto }) {
  const { status } = portal.request;
  if (status === 'CHANGES_REQUESTED') {
    return (
      <div
        className="flex gap-3 rounded-card border border-warning/30 bg-warning-soft p-4"
        role="status"
      >
        <MessageSquareWarning className="h-5 w-5 shrink-0 text-warning" aria-hidden />
        <div>
          <p className="font-medium text-warning">Changes needed</p>
          {portal.changesComment && (
            <p className="mt-1 text-sm whitespace-pre-line">{portal.changesComment}</p>
          )}
          <p className="mt-1 text-sm text-muted">Upload an updated version below.</p>
        </div>
      </div>
    );
  }
  if (status === 'SUBMITTED') {
    return (
      <div className="flex gap-3 rounded-card border border-info/20 bg-info-soft p-4" role="status">
        <Clock className="h-5 w-5 shrink-0 text-info" aria-hidden />
        <p className="text-sm">
          Thanks, your evidence is waiting for review. You don&apos;t need to do anything else, but
          you can replace it below if needed.
        </p>
      </div>
    );
  }
  if (status === 'ACCEPTED') {
    return (
      <div
        className="flex gap-3 rounded-card border border-success/20 bg-success-soft p-4"
        role="status"
      >
        <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden />
        <p className="text-sm">
          Your evidence has been accepted. Nothing more is needed. Thank you!
        </p>
      </div>
    );
  }
  return null;
}

/**
 * The magic-link token lives in the URL fragment (/e#<token>). Browsers never send fragments to a
 * server, so the token can't appear in the web host's access logs. It's read here, in the browser
 * only, and sent to the API as a header. During server rendering it's unknown, so that renders
 * the loading state.
 */
function subscribeToHash(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

/** Tokens are base64url. Anything else (a mangled or hand-edited link) is treated as missing. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

function useFragmentToken(): string | null {
  return useSyncExternalStore(
    subscribeToHash,
    () => {
      const raw = window.location.hash.slice(1);
      return TOKEN_PATTERN.test(raw) ? raw : '';
    },
    () => null,
  );
}

export default function OwnerPortalPage() {
  const token = useFragmentToken();
  if (token === null) return <LoadingState label="Loading your request…" />;
  if (!token) return <LinkProblem error={new ApiError(401, 'LINK_INVALID', '')} />;
  // Keyed by token, so opening a different link starts from a clean slate.
  return <OwnerPortal key={token} token={token} />;
}

function OwnerPortal({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const portal = useOwnerPortal(token);
  const upload = useEvidenceUpload(token);
  const [note, setNote] = useState('');
  const [justSubmitted, setJustSubmitted] = useState(false);

  if (portal.isPending) return <LoadingState label="Loading your request…" />;
  if (portal.isError) return <LinkProblem error={portal.error} />;

  const { request, currentSubmission } = portal.data;

  const onSubmit = async () => {
    setJustSubmitted(false);
    const submission = await upload.submit(note, request.version);
    if (submission) {
      setNote('');
      setJustSubmitted(true);
    }
    // Refresh either way: a stale-version error also needs the latest state.
    await queryClient.invalidateQueries({ queryKey: queryKeys.ownerPortal(token) });
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">{portal.data.auditName}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Badge>{request.controlRef}</Badge>
          <StatusBadge status={request.status} />
          {request.isOverdue && <Badge tone="danger">Overdue</Badge>}
        </div>
        <h1 className="mt-2 text-2xl font-semibold">{request.title}</h1>
        <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted">
          <CalendarDays className="h-4 w-4" aria-hidden />
          Due {formatDate(request.dueDate)}
        </p>
      </div>

      {request.instructions && (
        <Card className="p-4">
          <h2 className="text-sm font-medium text-muted">What&apos;s needed</h2>
          <p className="mt-1 whitespace-pre-line">{request.instructions}</p>
        </Card>
      )}

      {justSubmitted && request.status === 'SUBMITTED' ? (
        <div
          className="flex gap-3 rounded-card border border-success/20 bg-success-soft p-4"
          role="status"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden />
          <p className="text-sm">
            Submitted. Your compliance manager has been notified. You can close this page.
          </p>
        </div>
      ) : (
        <StatusMessage portal={portal.data} />
      )}

      {currentSubmission && (
        <section className="space-y-2">
          <h2 className="font-semibold">Your latest submission</h2>
          <p className="text-sm text-muted">
            Sent {new Date(currentSubmission.submittedAt).toLocaleString()}
            {currentSubmission.note && <> · &ldquo;{currentSubmission.note}&rdquo;</>}
          </p>
          <SubmissionFiles files={currentSubmission.files} />
        </section>
      )}

      {portal.data.canSubmit ? (
        <section className="space-y-4">
          <h2 className="font-semibold">
            {currentSubmission ? 'Upload a new version' : 'Upload your evidence'}
          </h2>
          <EvidenceDropzone
            items={upload.items}
            disabled={upload.submitting}
            onAdd={upload.add}
            onRemove={upload.remove}
          />
          <Field id="owner-note" label="Note for your compliance manager" optional>
            <Textarea
              id="owner-note"
              value={note}
              maxLength={2000}
              disabled={upload.submitting}
              placeholder="Anything they should know about these files"
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          {upload.error && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {upload.error}
            </p>
          )}
          <Button className="w-full sm:w-auto" loading={upload.submitting} onClick={onSubmit}>
            {upload.submitting ? 'Uploading and checking…' : 'Submit evidence'}
          </Button>
          <p className="text-xs text-muted">
            Files go straight to encrypted storage and are checked before your manager can open
            them. Don&apos;t share this page&apos;s link: anyone with it can upload to this request.
          </p>
        </section>
      ) : (
        request.status !== 'ACCEPTED' && (
          <p className="text-sm text-muted">
            This audit has been closed, so no more evidence is needed.
          </p>
        )
      )}
    </div>
  );
}

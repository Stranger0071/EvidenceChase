'use client';

import type { EvidenceRequestDto, SendAudience } from '@evidencechase/shared';
import { Send } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useSendRequests } from '@/hooks/use-review';
import { errorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';

const OPTIONS: Array<{ audience: SendAudience; title: string; body: string }> = [
  {
    audience: 'all',
    title: 'Everyone who still owes evidence',
    body: 'Each owner gets all of their open requests.',
  },
  {
    audience: 'overdue',
    title: 'Overdue only',
    body: 'Only requests past their due date, to the people who owe them.',
  },
  {
    audience: 'changes_requested',
    title: 'Sent back for changes',
    body: 'Only requests you asked to be redone, to the people who owe them.',
  },
  {
    audience: 'selected',
    title: 'Choose people',
    body: 'Each person you pick gets all of their open requests.',
  },
];

/** Mirrors the API's filter, so the counts shown are what will be sent. */
function inAudience(request: EvidenceRequestDto, audience: SendAudience, chosen: Set<string>) {
  switch (audience) {
    case 'all':
      return true;
    case 'overdue':
      return request.isOverdue;
    case 'changes_requested':
      return request.status === 'CHANGES_REQUESTED';
    case 'selected':
      return chosen.has(request.ownerEmail);
  }
}

interface Owner {
  email: string;
  name: string | null;
  open: number;
  overdue: number;
}

function plural(count: number, word: string, pluralWord = `${word}s`) {
  return `${count} ${count === 1 ? word : pluralWord}`;
}

/** Emails evidence requests to everyone who owes them, or to a narrower group. */
export function SendRequestsDialog({
  auditId,
  requests,
  open,
  onOpenChange,
}: {
  auditId: string;
  requests: EvidenceRequestDto[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [audience, setAudience] = useState<SendAudience>('all');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const sendRequests = useSendRequests(auditId);

  const openRequests = useMemo(
    () =>
      requests.filter(
        (request) => request.status === 'PENDING' || request.status === 'CHANGES_REQUESTED',
      ),
    [requests],
  );
  const owners = useMemo(() => {
    const byEmail = new Map<string, Owner>();
    for (const request of openRequests) {
      const owner = byEmail.get(request.ownerEmail) ?? {
        email: request.ownerEmail,
        name: null,
        open: 0,
        overdue: 0,
      };
      owner.name ??= request.ownerName;
      owner.open += 1;
      if (request.isOverdue) owner.overdue += 1;
      byEmail.set(request.ownerEmail, owner);
    }
    return [...byEmail.values()].sort((a, b) =>
      (a.name ?? a.email).localeCompare(b.name ?? b.email),
    );
  }, [openRequests]);

  const countsFor = (option: SendAudience) => {
    const matching = openRequests.filter((request) => inAudience(request, option, chosen));
    return {
      requests: matching.length,
      people: new Set(matching.map((request) => request.ownerEmail)).size,
    };
  };
  const selected = countsFor(audience);

  const close = (next: boolean) => {
    if (!next) {
      setAudience('all');
      setChosen(new Set());
    }
    onOpenChange(next);
  };

  const toggle = (email: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });

  const onSend = () =>
    sendRequests.mutate(
      { audience, ownerEmails: audience === 'selected' ? [...chosen] : [] },
      {
        onSuccess: ({ emailsSent, requestsIncluded, failedRecipients }) => {
          close(false);
          toast.success(
            `Sent ${plural(emailsSent, 'email')} covering ${plural(requestsIncluded, 'request')}`,
          );
          if (failedRecipients.length > 0) {
            toast.error(
              `Couldn't email ${failedRecipients.join(', ')}. Use "Copy link" to send their links another way.`,
              { duration: 15_000 },
            );
          }
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Send evidence requests"
      description="Each person gets one email listing their requests, each with its own secure upload link. Requests that already have evidence submitted are never included."
    >
      <fieldset className="space-y-2">
        <legend className="sr-only">Who to email</legend>
        {OPTIONS.map((option) => {
          const counts = option.audience === 'selected' ? null : countsFor(option.audience);
          const empty = counts !== null && counts.requests === 0;
          return (
            <label
              key={option.audience}
              className={cn(
                'flex gap-3 rounded-lg border p-3',
                empty ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                audience === option.audience ? 'border-primary bg-info-soft' : 'border-border',
              )}
            >
              <input
                type="radio"
                name="send-audience"
                className="mt-1 accent-primary"
                checked={audience === option.audience}
                disabled={empty}
                onChange={() => setAudience(option.audience)}
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center justify-between gap-x-3">
                  <span className="text-sm font-medium">{option.title}</span>
                  {counts && (
                    <span className="text-xs text-muted">
                      {empty
                        ? 'None'
                        : `${plural(counts.people, 'person', 'people')} · ${plural(counts.requests, 'request')}`}
                    </span>
                  )}
                </span>
                <span className="block text-sm text-muted">{option.body}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {audience === 'selected' && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {chosen.size} of {owners.length} chosen
            </span>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setChosen(new Set(owners.map((owner) => owner.email)))}
              >
                Select all
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setChosen(new Set())}>
                Clear
              </Button>
            </div>
          </div>
          <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {owners.map((owner) => (
              <li key={owner.email}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-neutral-soft">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={chosen.has(owner.email)}
                    onChange={() => toggle(owner.email)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {owner.name ?? owner.email}
                    </span>
                    {owner.name && (
                      <span className="block truncate text-xs text-muted">{owner.email}</span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {owner.overdue > 0 && <Badge tone="danger">{owner.overdue} overdue</Badge>}
                    <span className="text-xs text-muted">{owner.open} open</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => close(false)} disabled={sendRequests.isPending}>
          Cancel
        </Button>
        <Button
          onClick={onSend}
          loading={sendRequests.isPending}
          disabled={selected.requests === 0}
        >
          <Send className="h-4 w-4" aria-hidden />
          {selected.people === 0 ? 'Send emails' : `Send ${plural(selected.people, 'email')}`}
        </Button>
      </div>
    </Dialog>
  );
}

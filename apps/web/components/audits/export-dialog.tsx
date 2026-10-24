'use client';

import type { ExportScope } from '@evidencechase/shared';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useExportLink } from '@/hooks/use-audits';
import { errorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';

const OPTIONS: Array<{ scope: ExportScope; title: string; body: string }> = [
  {
    scope: 'accepted',
    title: 'Accepted evidence only',
    body: 'What you hand to the auditor: every accepted file, one folder per control.',
  },
  {
    scope: 'all',
    title: 'Everything so far',
    body: 'Also includes evidence still waiting for review, and lists requests with nothing submitted yet.',
  },
];

/**
 * Downloads the evidence pack: a ZIP with one folder per control, an index.csv with SHA-256
 * fingerprints checked during the export, and a README on how to verify them.
 */
export function ExportDialog({
  auditId,
  open,
  onOpenChange,
}: {
  auditId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [scope, setScope] = useState<ExportScope>('accepted');
  const exportLink = useExportLink(auditId);

  const onDownload = () =>
    exportLink.mutate(scope, {
      onSuccess: ({ url }) => {
        // The signed link goes straight to the API and downloads as an attachment, so the page stays put.
        window.location.assign(url);
        toast.success('Preparing your evidence pack. The download starts in a moment.');
        onOpenChange(false);
      },
      onError: (error) => toast.error(errorMessage(error)),
    });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Export evidence pack"
      description="A ZIP with a folder per control, plus index.csv: who supplied each file, when it was accepted, and its SHA-256 fingerprint, re-checked as the pack is built."
    >
      <fieldset className="space-y-2">
        <legend className="sr-only">What to include</legend>
        {OPTIONS.map((option) => (
          <label
            key={option.scope}
            className={cn(
              'flex cursor-pointer gap-3 rounded-lg border p-3',
              scope === option.scope ? 'border-primary bg-info-soft' : 'border-border',
            )}
          >
            <input
              type="radio"
              name="export-scope"
              className="mt-1 accent-primary"
              checked={scope === option.scope}
              onChange={() => setScope(option.scope)}
            />
            <span>
              <span className="block text-sm font-medium">{option.title}</span>
              <span className="block text-sm text-muted">{option.body}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button onClick={onDownload} loading={exportLink.isPending}>
          <Download className="h-4 w-4" aria-hidden />
          Download ZIP
        </Button>
      </div>
    </Dialog>
  );
}

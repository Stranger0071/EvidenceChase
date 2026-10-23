import { formatBytes, type EvidenceFileDto } from '@evidencechase/shared';
import type { ReactNode } from 'react';
import { FileStateBadge } from './file-state-badge';

/** A submission's files with their scan state. `actions` adds buttons per file (manager view). */
export function SubmissionFiles({
  files,
  actions,
}: {
  files: EvidenceFileDto[];
  actions?: (file: EvidenceFileDto) => ReactNode;
}) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {files.map((file) => (
        <li key={file.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.originalName}</p>
            <p className="text-xs text-muted">
              {formatBytes(file.sizeBytes)}
              {file.sha256 && (
                <span title={`SHA-256 ${file.sha256}`}> · SHA-256 {file.sha256.slice(0, 12)}…</span>
              )}
            </p>
            {file.state === 'REJECTED' && file.rejectReason && (
              <p className="mt-1 text-sm text-danger">Not accepted: {file.rejectReason}</p>
            )}
          </div>
          <FileStateBadge file={file} />
          {actions?.(file)}
        </li>
      ))}
    </ul>
  );
}

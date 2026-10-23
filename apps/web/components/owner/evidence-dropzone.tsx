'use client';

import { ALLOWED_FILE_TYPES, FILE_LIMITS, formatBytes } from '@evidencechase/shared';
import { AlertCircle, CheckCircle2, FileText, Upload, X } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { Button } from '@/components/ui/button';
import type { SelectedFile } from '@/hooks/use-evidence-upload';
import { cn } from '@/lib/utils';

const ACCEPT = Object.keys(ALLOWED_FILE_TYPES)
  .map((extension) => `.${extension}`)
  .join(',');
const ACCEPTED_LABEL = Object.keys(ALLOWED_FILE_TYPES)
  .filter((extension) => extension !== 'jpeg')
  .map((extension) => extension.toUpperCase())
  .join(', ');

interface EvidenceDropzoneProps {
  items: SelectedFile[];
  disabled: boolean;
  onAdd: (files: Iterable<File>) => void;
  onRemove: (key: string) => void;
}

/** Drag-and-drop or browse. The whole zone is a real button, so it works from the keyboard too. */
export function EvidenceDropzone({ items, disabled, onAdd, onRemove }: EvidenceDropzoneProps) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (!disabled) onAdd(event.dataTransfer.files);
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex w-full cursor-pointer flex-col items-center gap-2 rounded-card border-2 border-dashed border-border bg-surface px-6 py-8 text-center transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60',
          dragging && 'border-primary bg-info-soft',
        )}
      >
        <Upload className="h-6 w-6 text-primary" aria-hidden />
        <span className="font-medium">Drop files here, or click to choose</span>
        <span className="text-sm text-muted">
          {ACCEPTED_LABEL} · up to {FILE_LIMITS.maxFileBytes / 1024 / 1024} MB each ·{' '}
          {FILE_LIMITS.maxFilesPerSubmission} files at a time
        </span>
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          if (event.target.files) onAdd(event.target.files);
          event.target.value = '';
        }}
      />

      {items.length > 0 && (
        <ul
          className="divide-y divide-border rounded-card border border-border bg-surface"
          aria-label="Files to submit"
        >
          {items.map((item) => (
            <li key={item.key} className="flex items-start gap-3 px-4 py-3">
              {item.status === 'error' ? (
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden />
              ) : item.status === 'uploaded' ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden />
              ) : (
                <FileText className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.file.name}</p>
                <p className="text-xs text-muted">{formatBytes(item.file.size)}</p>
                {item.error && (
                  <p className="mt-1 text-sm text-danger" role="alert">
                    {item.error}
                  </p>
                )}
                {item.status === 'uploading' && (
                  <div
                    className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-soft"
                    role="progressbar"
                    aria-label={`Uploading ${item.file.name}`}
                    aria-valuenow={Math.round(item.progress * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="h-full bg-primary transition-[width]"
                      style={{ width: `${item.progress * 100}%` }}
                    />
                  </div>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${item.file.name}`}
                disabled={disabled || item.status === 'uploading'}
                onClick={() => onRemove(item.key)}
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

'use client';

import {
  CSV_IMPORT_LIMITS,
  parseRequestsCsv,
  type CsvImportErrorDetails,
  type CsvParseResult,
  type CsvRowError,
} from '@evidencechase/shared';
import { Download, FileUp } from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useImportRequests } from '@/hooks/use-requests';
import { ApiError, errorMessage } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';

interface CsvImportDialogProps {
  auditId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SelectedFile {
  name: string;
  text: string;
  preview: CsvParseResult;
}

const PREVIEW_ROWS = 8;

function ErrorTable({ errors }: { errors: CsvRowError[] }) {
  return (
    <div className="max-h-64 overflow-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-neutral-soft text-xs text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Row</th>
            <th className="px-3 py-2 font-medium">Column</th>
            <th className="px-3 py-2 font-medium">Problem</th>
          </tr>
        </thead>
        <tbody>
          {errors.map((error, index) => (
            <tr key={index} className="border-t border-border">
              <td className="px-3 py-2 tabular-nums">{error.row ?? 'File'}</td>
              <td className="px-3 py-2">{error.field ?? '—'}</td>
              <td className="px-3 py-2 text-danger">{error.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Bulk import. The file is parsed and validated in the browser with the same function the API
 * uses, so problems show up before anything is sent. The API still re-validates the raw text.
 */
export function CsvImportDialog({ auditId, open, onOpenChange }: CsvImportDialogProps) {
  const importRequests = useImportRequests(auditId);
  const [file, setFile] = useState<SelectedFile | null>(null);
  const [serverErrors, setServerErrors] = useState<CsvRowError[] | null>(null);

  const close = (nextOpen: boolean) => {
    if (!nextOpen) {
      setFile(null);
      setServerErrors(null);
      importRequests.reset();
    }
    onOpenChange(nextOpen);
  };

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    event.target.value = '';
    setServerErrors(null);
    if (!selected) return;
    if (selected.size > CSV_IMPORT_LIMITS.maxBytes) {
      toast.error('That file is larger than 1 MB.');
      return;
    }
    const text = await selected.text();
    setFile({ name: selected.name, text, preview: parseRequestsCsv(text) });
  };

  const onImport = () => {
    if (!file) return;
    importRequests.mutate(file.text, {
      onSuccess: ({ imported }) => {
        toast.success(`Imported ${imported} request${imported === 1 ? '' : 's'}`);
        close(false);
      },
      onError: (error) => {
        if (error instanceof ApiError && error.code === 'CSV_INVALID') {
          setServerErrors((error.details as CsvImportErrorDetails).rows);
        } else {
          toast.error(errorMessage(error));
        }
      },
    });
  };

  const errors = serverErrors ?? (file && !file.preview.ok ? file.preview.errors : null);
  const rows = file?.preview.ok ? file.preview.rows : [];

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Import requests from CSV"
      description="Columns: controlRef, title, instructions, ownerName, ownerEmail, dueDate (YYYY-MM-DD). Every row must be valid, or nothing is imported."
      className="max-w-3xl"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium hover:bg-neutral-soft focus-within:outline-2 focus-within:outline-ring">
            <FileUp className="h-4 w-4" aria-hidden />
            {file ? 'Choose another file' : 'Choose CSV file'}
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={onFileChange} />
          </label>
          <a
            href="/sample-requests.csv"
            download
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <Download className="h-4 w-4" aria-hidden />
            Download a sample CSV
          </a>
        </div>

        {file && <p className="text-sm text-muted">{file.name}</p>}

        {errors && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-danger" role="alert">
              {errors.length} problem{errors.length === 1 ? '' : 's'} found. Fix the file and choose
              it again. Nothing was imported.
            </p>
            <ErrorTable errors={errors} />
          </div>
        )}

        {!errors && rows.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm">
              <span className="font-medium">{rows.length}</span> request
              {rows.length === 1 ? '' : 's'} ready to import
              {rows.length > PREVIEW_ROWS && `. Showing the first ${PREVIEW_ROWS}`}.
            </p>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-neutral-soft text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Control</th>
                    <th className="px-3 py-2 font-medium">What's needed</th>
                    <th className="px-3 py-2 font-medium">Owner</th>
                    <th className="px-3 py-2 font-medium">Due</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, PREVIEW_ROWS).map((row) => (
                    <tr key={row.controlRef} className="border-t border-border">
                      <td className="px-3 py-2 font-mono text-xs">{row.controlRef}</td>
                      <td className="px-3 py-2">{row.title}</td>
                      <td className="px-3 py-2">{row.ownerEmail}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.dueDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button
            onClick={onImport}
            disabled={!file || !!errors}
            loading={importRequests.isPending}
          >
            Import {rows.length > 0 ? rows.length : ''} request{rows.length === 1 ? '' : 's'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

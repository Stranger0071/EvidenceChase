'use client';

import {
  declaredTypeFor,
  FILE_LIMITS,
  formatBytes,
  type SubmissionDto,
} from '@evidencechase/shared';
import { useCallback, useState } from 'react';
import { ApiError, errorMessage } from '@/lib/api-client';
import { uploadToStorage } from '@/lib/upload';
import { ownerApi } from './use-owner-portal';

export interface SelectedFile {
  key: string;
  file: File;
  type: string;
  status: 'ready' | 'uploading' | 'uploaded' | 'error';
  progress: number;
  /** Set once the API has registered the file. An uploaded file can be submitted again without re-uploading. */
  fileId?: string;
  error?: string;
}

interface FileProblem {
  name: string;
  reason: string;
}

const MAX_MB = FILE_LIMITS.maxFileBytes / 1024 / 1024;

/** Problems the API reported per file (422 FILES_REJECTED), keyed by file name. */
function fileProblems(error: unknown): Map<string, string> | null {
  if (!(error instanceof ApiError) || error.code !== 'FILES_REJECTED') return null;
  const files = (error.details as { files?: FileProblem[] } | undefined)?.files ?? [];
  return new Map(files.map((problem) => [problem.name, problem.reason]));
}

/**
 * The owner's upload flow: choose files → get upload links → upload each straight to S3 with
 * progress → submit. The browser checks type and size first for quick feedback; the API checks
 * everything again, because the browser is never trusted.
 */
export function useEvidenceUpload(token: string) {
  const [items, setItems] = useState<SelectedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (key: string, patch: Partial<SelectedFile>) =>
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  const add = useCallback((files: Iterable<File>) => {
    setError(null);
    // Copy now: a FileList from an <input> or a drop is live, and is emptied as soon as the input
    // is reset, which happens before React runs the state update below.
    const chosen = Array.from(files);
    setItems((current) => {
      const added = chosen.map((file): SelectedFile => {
        const type = declaredTypeFor(file.name, file.type);
        const problem = !type
          ? "This type of file isn't accepted"
          : file.size === 0
            ? 'This file is empty'
            : file.size > FILE_LIMITS.maxFileBytes
              ? `This file is ${formatBytes(file.size)}; the limit is ${MAX_MB} MB`
              : undefined;
        return {
          key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
          file,
          type: type ?? '',
          status: problem ? 'error' : 'ready',
          progress: 0,
          error: problem,
        };
      });
      return [...current, ...added];
    });
  }, []);

  const remove = useCallback((key: string) => {
    setItems((current) => current.filter((item) => item.key !== key));
  }, []);

  const submit = useCallback(
    async (note: string, version: number): Promise<SubmissionDto | null> => {
      const valid = items.filter((item) => item.status !== 'error');
      if (valid.length === 0) {
        setError('Add at least one file.');
        return null;
      }
      if (valid.length > FILE_LIMITS.maxFilesPerSubmission) {
        setError(`Submit at most ${FILE_LIMITS.maxFilesPerSubmission} files at a time.`);
        return null;
      }

      setSubmitting(true);
      setError(null);
      const api = ownerApi(token);
      try {
        // 1. Upload links for files that don't have one yet.
        const fresh = valid.filter((item) => !item.fileId);
        const fileIds = new Map(
          valid.flatMap((item) => (item.fileId ? [[item.key, item.fileId]] : [])),
        );
        if (fresh.length > 0) {
          const uploads = await api.prepare(
            fresh.map((item) => ({ name: item.file.name, size: item.file.size, type: item.type })),
          );

          // 2. Upload each file straight to S3.
          const results = await Promise.allSettled(
            fresh.map(async (item, index) => {
              const prepared = uploads[index]!;
              update(item.key, { status: 'uploading', progress: 0, error: undefined });
              await uploadToStorage(prepared.upload, item.file, (progress) =>
                update(item.key, { progress }),
              );
              update(item.key, { status: 'uploaded', fileId: prepared.fileId });
              fileIds.set(item.key, prepared.fileId);
            }),
          );
          // A failed upload can be retried, so it goes back to "ready" (keeping its message) and is
          // uploaded again on the next Submit. "error" is for files that can never be accepted.
          results.forEach((result, index) => {
            if (result.status === 'rejected') {
              update(fresh[index]!.key, {
                status: 'ready',
                progress: 0,
                error: errorMessage(result.reason),
                fileId: undefined,
              });
            }
          });
          if (results.some((result) => result.status === 'rejected')) {
            setError(
              'Some files failed to upload. Press Submit to try them again, or remove them.',
            );
            return null;
          }
        }

        // 3. Submit. The API re-checks every file's real contents before accepting it.
        const submission = await api.submit({
          fileIds: valid.map((item) => fileIds.get(item.key)!),
          note,
          version,
        });
        setItems([]);
        return submission;
      } catch (caught) {
        const problems = fileProblems(caught);
        if (problems) {
          // Refused files were deleted on the server, so they can't be reused.
          setItems((current) =>
            current.map((item) =>
              problems.has(item.file.name)
                ? {
                    ...item,
                    status: 'error',
                    error: problems.get(item.file.name),
                    fileId: undefined,
                  }
                : item,
            ),
          );
          setError('Some files were not accepted. Remove them and submit the rest.');
        } else {
          setError(errorMessage(caught));
        }
        return null;
      } finally {
        setSubmitting(false);
      }
    },
    [items, token],
  );

  return { items, add, remove, submit, submitting, error };
}

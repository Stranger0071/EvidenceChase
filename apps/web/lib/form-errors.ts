import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from './api-client';

/**
 * Shows a 422 from the API next to the matching form fields. Returns true if it did, so the
 * caller only needs a toast for other errors. The server validates with the same Zod schemas
 * as the form, so this mostly catches rules only the server can check.
 */
export function applyServerFieldErrors<T extends FieldValues>(
  error: unknown,
  fields: readonly Path<T>[],
  setError: UseFormSetError<T>,
): boolean {
  if (!(error instanceof ApiError) || !error.fieldErrors) return false;

  let applied = false;
  for (const [field, messages] of Object.entries(error.fieldErrors)) {
    if ((fields as readonly string[]).includes(field) && messages[0]) {
      setError(field as Path<T>, { type: 'server', message: messages[0] });
      applied = true;
    }
  }
  return applied;
}

import type { ApiErrorBody, FieldErrors } from '@evidencechase/shared';

/** An error response from the API, or a network failure (status 0). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Per-field messages from a 422 validation error, if there are any. */
  get fieldErrors(): FieldErrors | null {
    if (this.code !== 'VALIDATION_FAILED' || typeof this.details !== 'object' || !this.details) {
      return null;
    }
    return this.details as FieldErrors;
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/**
 * Calls the API through the same-origin /api proxy (see next.config.ts), so the session cookie
 * is sent automatically and never handled by JavaScript.
 */
async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
  contentType?: string,
): Promise<T> {
  const headers: Record<string, string> = {};
  let payload: BodyInit | undefined;
  if (contentType) {
    headers['Content-Type'] = contentType;
    payload = body as string;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: payload,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      "Couldn't reach the server. Check your connection and try again.",
    );
  }

  if (response.status === 204) return undefined as T;

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (data as ApiErrorBody | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'UNKNOWN_ERROR',
      error?.message ?? `The server returned an error (${response.status}). Please try again.`,
      error?.details,
    );
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: (path: string) => request<void>('DELETE', path),
  postCsv: <T>(path: string, csv: string) => request<T>('POST', path, csv, 'text/csv'),
};

/** A message that's safe to show the user for any thrown value. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

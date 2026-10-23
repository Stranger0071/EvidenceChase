import { ALLOWED_FILE_TYPES } from './constants';

/** Lowercase extension without the dot, or null ("report", ".env"). */
export function extensionOf(name: string): string | null {
  const dot = name.lastIndexOf('.');
  if (dot < 1 || dot === name.length - 1) return null;
  return name.slice(dot + 1).toLowerCase();
}

/**
 * The content type to declare for an upload. Browsers report CSVs inconsistently ("", "text/csv"
 * or "application/vnd.ms-excel"), so an unknown or missing browser type falls back to the standard
 * type for the extension. Returns null for extensions that aren't allowed at all.
 */
export function declaredTypeFor(name: string, browserType: string): string | null {
  const extension = extensionOf(name);
  const allowed = extension ? ALLOWED_FILE_TYPES[extension] : undefined;
  if (!allowed) return null;
  return allowed.includes(browserType) ? browserType : allowed[0]!;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

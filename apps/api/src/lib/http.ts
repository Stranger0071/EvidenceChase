const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escapes text for HTML. Emails include names, titles and comments that people typed, so every
 * value is escaped before it goes into a template. Otherwise anyone could inject markup or links.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]!);
}

/**
 * A `Content-Disposition` header value for a user-supplied filename. The plain `filename` is an
 * ASCII-only fallback with quotes, backslashes and control characters removed (they could break
 * out of the header). `filename*` carries the real name, percent-encoded as UTF-8 (RFC 6266).
 */
export function contentDisposition(type: 'attachment' | 'inline', filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]|["\\]/g, '_').trim() || 'download';
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

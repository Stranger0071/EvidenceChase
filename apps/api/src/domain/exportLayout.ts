/**
 * Folder and file names inside the evidence ZIP (PRD §6.6: `/<controlRef>-<slug>/<file>`).
 * Every name comes from something a person typed, so each one is made safe: no path separators,
 * no `..`, no control or reserved characters, and nothing hidden. That rules out "zip slip",
 * where an entry writes outside the folder when unzipped.
 */

// Matching control characters is exactly what this pattern is for, so the lint rule doesn't apply.
// eslint-disable-next-line no-control-regex
const RESERVED = /[<>:"/\\|?*\u0000-\u001f\u007f]/g;
const MAX_SEGMENT = 120;

/** One safe path segment (a folder or file name). */
export function safeSegment(name: string, fallback: string): string {
  const cleaned = name
    .normalize('NFC')
    .replace(RESERVED, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s-]+/, '') // no hidden files or leading dashes
    .replace(/[.\s]+$/, ''); // Windows drops trailing dots and spaces
  return cleaned.slice(0, MAX_SEGMENT) || fallback;
}

/** "Quarterly access review (Q3)" → "quarterly-access-review-q3" */
export function slugify(text: string, maxLength = 40): string {
  return (
    text
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, maxLength)
      .replace(/-+$/, '') || 'request'
  );
}

/** The folder for one request: "CC6.1-mfa-enforcement-screenshot". */
export function requestFolder(controlRef: string, title: string): string {
  return `${safeSegment(controlRef, 'control')}-${slugify(title)}`;
}

/**
 * Hands out unique names within one folder: a second "screenshot.png" becomes
 * "screenshot (2).png", so no file in the pack overwrites another.
 */
export function uniqueNamer(): (folder: string, fileName: string) => string {
  const used = new Set<string>();
  return (folder, fileName) => {
    const safe = safeSegment(fileName, 'file');
    const dot = safe.lastIndexOf('.');
    const [stem, extension] = dot > 0 ? [safe.slice(0, dot), safe.slice(dot)] : [safe, ''];
    let candidate = safe;
    for (let n = 2; used.has(`${folder}/${candidate}`.toLowerCase()); n += 1) {
      candidate = `${stem} (${n})${extension}`;
    }
    used.add(`${folder}/${candidate}`.toLowerCase());
    return `${folder}/${candidate}`;
  };
}

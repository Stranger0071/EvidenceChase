import { describe, expect, it } from 'vitest';
import { declaredTypeFor, extensionOf, formatBytes } from './files';

describe('extensionOf', () => {
  it.each([
    ['Report.PDF', 'pdf'],
    ['q3.access-review.xlsx', 'xlsx'],
    ['archive.tar.gz', 'gz'],
  ])('%s → %s', (name, extension) => {
    expect(extensionOf(name)).toBe(extension);
  });

  it.each(['no-extension', '.env', 'trailing.'])('returns null for %s', (name) => {
    expect(extensionOf(name)).toBeNull();
  });
});

describe('declaredTypeFor', () => {
  it('keeps an allowed browser type', () => {
    expect(declaredTypeFor('export.csv', 'application/vnd.ms-excel')).toBe(
      'application/vnd.ms-excel',
    );
  });

  it('falls back to the standard type when the browser reports none', () => {
    expect(declaredTypeFor('export.csv', '')).toBe('text/csv');
  });

  it('ignores a browser type that does not belong to the extension', () => {
    expect(declaredTypeFor('scan.pdf', 'application/x-msdownload')).toBe('application/pdf');
  });

  it('refuses extensions that are not allowed', () => {
    expect(declaredTypeFor('setup.exe', 'application/x-msdownload')).toBeNull();
  });
});

describe('formatBytes', () => {
  it('formats sizes for people', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(20 * 1024)).toBe('20 KB');
    expect(formatBytes(25 * 1024 * 1024)).toBe('25.0 MB');
  });
});

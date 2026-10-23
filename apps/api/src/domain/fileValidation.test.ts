import { describe, expect, it } from 'vitest';
import { checkDeclaredFile, checkDetectedType } from './fileValidation';

const MB = 1024 * 1024;

describe('checkDeclaredFile', () => {
  it.each([
    { name: 'soc2.pdf', size: MB, type: 'application/pdf' },
    { name: 'mfa.PNG', size: 500 * 1024, type: 'image/png' },
    { name: 'export.csv', size: 100, type: 'application/vnd.ms-excel' },
    { name: 'exactly-25mb.pdf', size: 25 * MB, type: 'application/pdf' },
  ])('accepts $name', (file) => {
    expect(checkDeclaredFile(file)).toBeNull();
  });

  it.each([
    [{ name: 'empty.pdf', size: 0, type: 'application/pdf' }, 'is empty'],
    [{ name: 'huge.pdf', size: 25 * MB + 1, type: 'application/pdf' }, 'larger than 25 MB'],
    [{ name: 'setup.exe', size: 1024, type: 'application/x-msdownload' }, "aren't accepted"],
    [{ name: 'spoofed.pdf', size: 1024, type: 'application/x-sh' }, "doesn't match .pdf"],
    [{ name: 'README', size: 1024, type: 'text/plain' }, 'no file extension'],
  ])('rejects %o', (file, reason) => {
    expect(checkDeclaredFile(file)).toContain(reason);
  });
});

describe('checkDetectedType', () => {
  it.each([
    ['pdf', 'application/pdf'],
    ['png', 'image/png'],
    ['jpg', 'image/jpeg'],
    ['jpeg', 'image/jpeg'],
    ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ])('accepts .%s whose content is %s', (extension, detected) => {
    expect(checkDetectedType(extension, detected)).toBeNull();
  });

  it('rejects a program renamed to .pdf', () => {
    expect(checkDetectedType('pdf', 'application/x-msdownload')).toBe(
      'the file is really application/x-msdownload, not a .pdf file',
    );
  });

  it('rejects a PNG renamed to .pdf', () => {
    expect(checkDetectedType('pdf', 'image/png')).toContain('really image/png');
  });

  it('rejects a binary file with no recognisable signature', () => {
    expect(checkDetectedType('pdf', null)).toContain("don't look like a .pdf");
  });

  it('rejects a plain ZIP posing as a Word document', () => {
    expect(checkDetectedType('docx', 'application/zip')).toContain('really application/zip');
  });

  it('accepts text files, which have no signature', () => {
    expect(checkDetectedType('csv', null)).toBeNull();
    expect(checkDetectedType('txt', null)).toBeNull();
  });

  it('rejects a binary file posing as text', () => {
    expect(checkDetectedType('csv', 'application/pdf')).toBe(
      'the file is really application/pdf, not text',
    );
  });
});

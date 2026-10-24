import { describe, expect, it } from 'vitest';
import { requestFolder, safeSegment, slugify, uniqueNamer } from './exportLayout';

describe('requestFolder', () => {
  it('combines the control ID with a slug of the title', () => {
    expect(requestFolder('CC6.1', 'MFA enforcement screenshot')).toBe(
      'CC6.1-mfa-enforcement-screenshot',
    );
  });

  it('makes slashes in control IDs safe', () => {
    expect(requestFolder('A.9/2.1', 'Access')).toBe('A.9-2.1-access');
  });
});

describe('slugify', () => {
  it('handles accents, punctuation and long titles', () => {
    expect(slugify('Résumé: Q3 access review (final!)')).toBe('resume-q3-access-review-final');
    expect(slugify('x'.repeat(100))).toHaveLength(40);
    expect(slugify('***')).toBe('request');
  });
});

describe('safeSegment', () => {
  it.each([
    ['../../etc/passwd', 'etc-passwd'],
    ['..\\..\\windows\\system.ini', 'windows-system.ini'],
    ['.env', 'env'],
    ['report.pdf.', 'report.pdf'],
    ['a\u0000b.pdf', 'a-b.pdf'],
    ['CON:report?.pdf', 'CON-report-.pdf'],
  ])('%j → %j', (input, output) => {
    expect(safeSegment(input, 'file')).toBe(output);
  });

  it('never returns an empty name', () => {
    expect(safeSegment('...', 'file')).toBe('file');
  });
});

describe('uniqueNamer', () => {
  it('numbers duplicate names within a folder, ignoring case', () => {
    const name = uniqueNamer();
    expect(name('CC1-x', 'shot.png')).toBe('CC1-x/shot.png');
    expect(name('CC1-x', 'SHOT.png')).toBe('CC1-x/SHOT (2).png');
    expect(name('CC1-x', 'shot.png')).toBe('CC1-x/shot (3).png');
    expect(name('CC2-y', 'shot.png')).toBe('CC2-y/shot.png');
  });
});

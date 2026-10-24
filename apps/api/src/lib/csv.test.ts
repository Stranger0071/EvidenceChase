import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

describe('toCsv', () => {
  it('quotes every value and escapes quotes', () => {
    expect(toCsv([['a', 'say "hi", ok', 3, null]])).toBe('\uFEFF"a","say ""hi"", ok","3",""\r\n');
  });

  it('keeps line breaks inside a quoted cell', () => {
    expect(toCsv([['line 1\nline 2']])).toBe('\uFEFF"line 1\nline 2"\r\n');
  });

  it.each(['=HYPERLINK("https://evil.example")', '+1+1', '-2', '@SUM(A1)', '\t=cmd'])(
    'defuses a formula: %s',
    (value) => {
      expect(toCsv([[value]])).toMatch(/^\uFEFF"'/);
    },
  );
});

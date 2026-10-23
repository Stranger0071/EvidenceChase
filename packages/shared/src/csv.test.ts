import { describe, expect, it } from 'vitest';
import { CSV_IMPORT_LIMITS } from './constants';
import { parseRequestsCsv } from './csv';

const HEADER = 'controlRef,title,instructions,ownerName,ownerEmail,dueDate';

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

describe('parseRequestsCsv', () => {
  it('parses a valid file into normalized rows', () => {
    const result = parseRequestsCsv(
      csv(
        'CC6.1,MFA settings screenshot,Show the admin console,Rahul,Rahul@Example.com,2026-11-01',
        'CC7.2,Incident log export,,,secops@example.com,2026-11-15',
      ),
    );

    expect(result).toEqual({
      ok: true,
      rows: [
        {
          controlRef: 'CC6.1',
          title: 'MFA settings screenshot',
          instructions: 'Show the admin console',
          ownerName: 'Rahul',
          ownerEmail: 'rahul@example.com',
          dueDate: '2026-11-01',
        },
        {
          controlRef: 'CC7.2',
          title: 'Incident log export',
          instructions: null,
          ownerName: null,
          ownerEmail: 'secops@example.com',
          dueDate: '2026-11-15',
        },
      ],
    });
  });

  it('reports the spreadsheet row number of an invalid email', () => {
    const rows = Array.from(
      { length: 6 },
      (_, i) => `C${i},Title,,,owner${i}@example.com,2026-11-01`,
    );
    rows.push('C6,Title,,,not-an-email,2026-11-01');

    const result = parseRequestsCsv(csv(...rows));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Header is row 1, so the 7th data row is spreadsheet row 8.
    expect(result.errors).toEqual([
      { row: 8, field: 'ownerEmail', message: 'Enter a valid email address' },
    ]);
  });

  it('reports every missing required column', () => {
    const result = parseRequestsCsv('controlRef,title\nCC1,Something');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.field)).toEqual(['ownerEmail', 'dueDate']);
  });

  it('rejects duplicate control IDs case-insensitively', () => {
    const result = parseRequestsCsv(
      csv('CC6.1,A,,,a@example.com,2026-11-01', 'cc6.1,B,,,b@example.com,2026-11-01'),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      { row: 3, field: 'controlRef', message: 'Duplicate control ID "cc6.1" (also on row 2)' },
    ]);
  });

  it('handles a UTF-8 BOM, friendly headers and quoted commas from Excel', () => {
    const text =
      '\uFEFFControl Ref,Title,Owner Email,Due Date\r\n' +
      '"CC6.1","Access review, Q3",owner@example.com,2026-12-01\r\n';

    const result = parseRequestsCsv(text);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0]).toMatchObject({ controlRef: 'CC6.1', title: 'Access review, Q3' });
  });

  it('rejects impossible dates', () => {
    const result = parseRequestsCsv(csv('CC1,Title,,,a@example.com,2026-02-30'));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatchObject({ row: 2, field: 'dueDate' });
  });

  it('rejects a file with only a header', () => {
    const result = parseRequestsCsv(`${HEADER}\n`);

    expect(result).toEqual({
      ok: false,
      errors: [{ row: null, field: null, message: 'The file has no data rows' }],
    });
  });

  it('rejects files over the row limit', () => {
    const rows = Array.from(
      { length: CSV_IMPORT_LIMITS.maxRows + 1 },
      (_, i) => `C${i},Title,,,a@example.com,2026-11-01`,
    );

    const result = parseRequestsCsv(csv(...rows));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.message).toMatch(/limit is 500/);
  });

  it('collects errors from every row instead of stopping at the first', () => {
    const result = parseRequestsCsv(
      csv(',Title,,,a@example.com,2026-11-01', 'C2,,,,bad,2026-11-01'),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => [e.row, e.field])).toEqual([
      [2, 'controlRef'],
      [3, 'title'],
      [3, 'ownerEmail'],
    ]);
  });
});

import Papa from 'papaparse';
import { CSV_COLUMNS, CSV_IMPORT_LIMITS, REQUIRED_CSV_COLUMNS, type CsvColumn } from './constants';
import { requestInputSchema, type RequestData } from './schemas/request';

export interface CsvRowError {
  /** Spreadsheet row number: the header is row 1, so the first data row is row 2. Null for file-level errors. */
  row: number | null;
  field: string | null;
  message: string;
}

export type CsvParseResult =
  { ok: true; rows: RequestData[] } | { ok: false; errors: CsvRowError[] };

const HEADER_ROW_OFFSET = 2;

/** Lets people use "Control Ref", "control_ref" or "controlRef" interchangeably. */
function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

const CANONICAL_COLUMNS = new Map<string, CsvColumn>(
  CSV_COLUMNS.map((column) => [normalizeHeader(column), column]),
);

/**
 * Parses and validates a CSV of evidence requests. Validation is all-or-nothing: if any row is
 * invalid, every problem is reported and no rows are returned. The web app uses this for the
 * preview, and the API runs it again on the raw text, because the browser is never trusted.
 */
export function parseRequestsCsv(text: string): CsvParseResult {
  if (text.length > CSV_IMPORT_LIMITS.maxBytes) {
    return fail({ row: null, field: null, message: 'The file is larger than 1 MB' });
  }

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => CANONICAL_COLUMNS.get(normalizeHeader(header)) ?? header.trim(),
  });

  const headers = parsed.meta.fields ?? [];
  const missingColumns = REQUIRED_CSV_COLUMNS.filter((column) => !headers.includes(column));
  if (missingColumns.length > 0) {
    return {
      ok: false,
      errors: missingColumns.map((column) => ({
        row: null,
        field: column,
        message: `Missing required column "${column}"`,
      })),
    };
  }

  if (parsed.data.length === 0) {
    return fail({ row: null, field: null, message: 'The file has no data rows' });
  }
  if (parsed.data.length > CSV_IMPORT_LIMITS.maxRows) {
    return fail({
      row: null,
      field: null,
      message: `The file has ${parsed.data.length} rows; the limit is ${CSV_IMPORT_LIMITS.maxRows}`,
    });
  }

  const errors: CsvRowError[] = parsed.errors.map((error) => ({
    row: error.row === undefined ? null : error.row + HEADER_ROW_OFFSET,
    field: null,
    message: error.message,
  }));

  const rows: RequestData[] = [];
  const firstRowByControlRef = new Map<string, number>();

  parsed.data.forEach((raw, index) => {
    const rowNumber = index + HEADER_ROW_OFFSET;
    const result = requestInputSchema.safeParse(raw);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push({
          row: rowNumber,
          field: issue.path[0]?.toString() ?? null,
          message: issue.message,
        });
      }
      return;
    }

    const key = result.data.controlRef.toLowerCase();
    const firstRow = firstRowByControlRef.get(key);
    if (firstRow !== undefined) {
      errors.push({
        row: rowNumber,
        field: 'controlRef',
        message: `Duplicate control ID "${result.data.controlRef}" (also on row ${firstRow})`,
      });
      return;
    }
    firstRowByControlRef.set(key, rowNumber);
    rows.push(result.data);
  });

  return errors.length > 0 ? { ok: false, errors } : { ok: true, rows };
}

function fail(error: CsvRowError): CsvParseResult {
  return { ok: false, errors: [error] };
}

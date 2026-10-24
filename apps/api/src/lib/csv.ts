/**
 * Writes CSV for spreadsheets. Two protections:
 * - every value is quoted, so commas, quotes and line breaks can't shift columns;
 * - values starting with = + - @ (or a tab/carriage return) get a leading apostrophe, so Excel
 *   won't run them as formulas. That stops "CSV injection" from a title an owner or manager typed.
 */
export function toCsv(
  rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>,
): string {
  // CRLF line endings and a BOM, so Excel opens UTF-8 (names, accents) correctly.
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

/**
 * Tiny dependency-free CSV serializer (RFC 4180). Client-safe pure string math
 * so any export route can reuse the same escaping instead of re-rolling it.
 */

/** Escape one cell: quote it when it contains a comma, quote, or newline. */
export function csvCell(value: string | number | null | undefined): string {
  const v = value == null ? '' : String(value)
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

/** Build a CSV document from a header row + data rows (CRLF-joined per spec). */
export function toCsv(
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
): string {
  const lines = [headers.map(csvCell).join(',')]
  for (const r of rows) lines.push(r.map(csvCell).join(','))
  return lines.join('\r\n')
}

/** Cents → a plain decimal dollar string for a CSV cell (e.g. 1490 → "14.90"). */
export function csvDollars(cents: number | null | undefined): string {
  return ((cents ?? 0) / 100).toFixed(2)
}

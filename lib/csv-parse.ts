/**
 * A small, dependency-free, RFC-4180-tolerant CSV parser.
 *
 * Handles the cases a real patient export from a PMS or spreadsheet throws at
 * us: quoted fields containing commas, embedded newlines inside quotes,
 * escaped quotes (`""` → `"`), CRLF or LF line endings, a leading UTF-8 BOM,
 * and trailing blank lines. It is deliberately NOT a full streaming parser —
 * imports are capped upstream (5,000 rows) so a single-pass in-memory parse is
 * fine, and keeps the logic auditable.
 *
 * The parser is delimiter-agnostic per-call (defaults to comma) and never
 * throws on malformed input — a stray quote just gets folded into the field,
 * because a clinic uploading their patient list should get a best-effort parse
 * and a row-level error report, not a hard failure.
 */

export interface ParsedCsv {
  /** Header row (first non-empty record), with each cell trimmed. */
  header: string[]
  /** Data rows (everything after the header). Cells are NOT trimmed here. */
  rows: string[][]
}

const BOM = '﻿'

/**
 * Tokenize raw CSV text into a 2-D array of cells. Preserves every record;
 * the caller decides which is the header.
 */
export function parseCsv(input: string, delimiter = ','): string[][] {
  let text = input
  // Strip a leading UTF-8 BOM (Excel loves to add one).
  if (text.charCodeAt(0) === 0xfeff || text.startsWith(BOM)) {
    text = text.slice(1)
  }

  const records: string[][] = []
  let field = ''
  let record: string[] = []
  let inQuotes = false
  let i = 0
  const n = text.length

  const pushField = () => {
    record.push(field)
    field = ''
  }
  const pushRecord = () => {
    pushField()
    records.push(record)
    record = []
  }

  while (i < n) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          // Escaped quote inside a quoted field.
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += ch
      i += 1
      continue
    }

    if (ch === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (ch === delimiter) {
      pushField()
      i += 1
      continue
    }
    if (ch === '\r') {
      // Treat CRLF and a lone CR both as a record break.
      pushRecord()
      i += text[i + 1] === '\n' ? 2 : 1
      continue
    }
    if (ch === '\n') {
      pushRecord()
      i += 1
      continue
    }
    field += ch
    i += 1
  }

  // Flush the final record unless the input ended exactly on a newline with no
  // trailing content (which would otherwise push a phantom empty record).
  if (field.length > 0 || record.length > 0) {
    pushRecord()
  }

  // Drop fully-empty records (blank lines, trailing newline artifacts).
  return records.filter((r) => !(r.length === 1 && r[0].trim() === ''))
}

/**
 * Parse CSV and split into a trimmed header + raw data rows. Returns an empty
 * shape when there's no content. Short rows are left as-is (the caller maps by
 * column index and treats missing cells as empty).
 */
export function parseCsvTable(input: string, delimiter = ','): ParsedCsv {
  const records = parseCsv(input, delimiter)
  if (records.length === 0) return { header: [], rows: [] }
  const [first, ...rest] = records
  return {
    header: first.map((c) => c.trim()),
    rows: rest,
  }
}

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join, sep } from 'node:path'

/**
 * REFUNDED MONEY IS SUBTRACTED — the invariant this batch introduced, frozen.
 *
 * `DREAMCRM-23` recorded refunds; nothing clinic-facing read them, so eight
 * different surfaces each added the face value of money that had gone back to
 * the patient. The fix was one rule (`lib/net-collected.ts`) adopted by all of
 * them — and the way that fix rots is one new total at a time, written by
 * somebody who has the other seven nowhere in their head.
 *
 * Three shapes are banned, because they are the shapes the defect actually
 * took:
 *
 *  1. A SQL `sum()` straight over a refundable money column. That was the
 *     collections header and both patient-lifetime-spend queries.
 *  2. A JS `+=` straight off a refundable money column. That was the Payments
 *     hub sparkline and the Shop hub's revenue tile.
 *  3. The subtraction open-coded somewhere else, which is how one rule
 *     becomes eight again.
 *
 * All three are legal the moment the value goes through the netting rule —
 * the guard is against the RAW column, not against adding money up.
 *
 * Red run (2026-09-14): reverting `lib/services/collections.ts` alone fails
 * case 1 naming that file; reverting `lib/services/shop.ts` alone fails case 2
 * naming that file. Both were watched failing before this test was kept.
 */

/** The money columns a Connect refund can reduce (migration 0161). */
const REFUNDABLE_SQL_COLUMNS = [
  'schema.patientBalancePayment.amountCents',
  'schema.bookingDeposit.amountCents',
  'schema.shopOrder.totalCents',
]

/** Where the rule itself lives — the one place allowed to say `sum(...)`. */
const RULE_MODULE = 'lib/net-collected.ts'

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

/**
 * Comments out, code in. A guard that greps raw source passes on a doc
 * comment that merely NAMES the thing it is looking for — that is exactly how
 * the Slice 13 attachment-host guard went green over a live bug.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

interface Offender {
  where: string
  line: string
}

function scan(match: (line: string) => boolean): Offender[] {
  const root = process.cwd()
  const offenders: Offender[] = []
  for (const dir of ['lib', 'app']) {
    for (const file of walk(resolve(root, dir))) {
      const rel = file.slice(root.length + 1).split(sep).join('/')
      if (rel === RULE_MODULE) continue
      const lines = stripComments(readFileSync(file, 'utf8')).split('\n')
      lines.forEach((line, i) => {
        if (match(line)) offenders.push({ where: `${rel}:${i + 1}`, line: line.trim() })
      })
    }
  }
  return offenders
}

describe('refunded money is subtracted from every clinic-side total', () => {
  it('no SQL sum() runs straight over a refundable money column', () => {
    const offenders = scan((line) =>
      REFUNDABLE_SQL_COLUMNS.some((col) => line.includes('sum(${' + col + '}')),
    )
    expect(
      offenders,
      'sum this through sumNetCollectedSql (lib/net-collected.ts) — a raw sum counts refunded money as kept',
    ).toEqual([])
  })

  it('no JS accumulator adds a refundable money column at face value', () => {
    // `x += row.amountCents` / `x += row.totalCents`. The netted forms read
    // `+= netCollectedCents(...)` / `+= collectedCents(...)` and are fine.
    const raw = /\+=\s*[A-Za-z_$][\w$]*\.(amountCents|totalCents)\b/
    const offenders = scan((line) => raw.test(line))
    expect(
      offenders,
      'net this through netCollectedCents/collectedCents (lib/net-collected.ts) before adding it up',
    ).toEqual([])
  })

  it('nobody open-codes the subtraction the rule exists to own', () => {
    const handRolled = /\.(amountCents|totalCents)\s*-\s*[A-Za-z_$][\w$]*\.refundedAmountCents/
    const offenders = scan((line) => handRolled.test(line))
    expect(offenders, 'use netCollectedCents rather than re-deriving amount − refunded').toEqual([])
  })
})

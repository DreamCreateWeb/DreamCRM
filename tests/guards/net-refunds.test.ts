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
 * Four shapes are banned, because they are the shapes the defect actually
 * took:
 *
 *  1. A SQL `sum()` straight over a refundable money column. That was the
 *     collections header and both patient-lifetime-spend queries.
 *  2. A JS `+=` straight off a refundable money column. That was the Payments
 *     hub sparkline and the Shop hub's revenue tile.
 *  3. A JS `reduce` accumulating one. That was the appointment drawer's "Shop
 *     purchases" stat — and it is in this list because the first version of
 *     THIS GUARD did not model it, so the batch sweep found the drawer by
 *     hand while the guard reported clean. A guard that models two of the
 *     three shapes the defect takes is a guard with a door in it. (Worse: the
 *     first draft of this very case was written with backspace bytes where its
 *     `word-boundary` escapes should have been, so it matched nothing and
 *     passed. It was caught by running it against the live bug — which is why
 *     the red run is the rule and not the paperwork.)
 *  4. The subtraction open-coded somewhere else, which is how one rule
 *     becomes eight again.
 *
 * All four are legal the moment the value goes through the netting rule —
 * the guard is against the RAW column, not against adding money up.
 *
 * Red run (2026-09-14): reverting `lib/services/collections.ts` alone fails
 * case 1 naming that file; reverting `lib/services/shop.ts` alone fails case 2
 * naming that file; reverting `lib/services/appointments.ts` alone fails case
 * 3 naming that file. All watched failing before this test was kept.
 */

/** The money columns a Connect refund can reduce (migration 0161). */
const REFUNDABLE_SQL_COLUMNS = [
  'schema.patientBalancePayment.amountCents',
  'schema.bookingDeposit.amountCents',
  'schema.shopOrder.totalCents',
]

/** Where the rule itself lives — the one place allowed to say `sum(...)`. */
const RULE_MODULE = 'lib/net-collected.ts'

/**
 * The reduce rule matches on COLUMN NAME, because a whole-file scan cannot see
 * which table a row came from. These three add up an `amountCents`/`totalCents`
 * that no Connect refund can reduce, and each is listed with the reason rather
 * than quietly excluded — an allowlist entry somebody has to justify is the
 * point.
 */
const REDUCE_ALLOWED: Array<{ file: string; why: string }> = [
  {
    file: 'lib/services/referral-payouts.ts',
    why: 'sums referral_commission.amountCents — a different table with no refund column; a reversed commission is handled by reverseCommissionForInvoice, not by netting',
  },
  {
    file: 'lib/services/referrals.ts',
    why: 'same table, same reason — the void sweep totals accrued commissions',
  },
  {
    file: 'app/(portal)/patient/invoices/[receipt]/page.tsx',
    why: "sums the RECEIPT's own display lines to derive shipping & tax; the order total it compares against goes through netCollectedCents on the next line",
  },
]

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

/** Whole-FILE scan, for a shape that spans lines (a multi-line `reduce`). */
function scanSource(match: (src: string) => boolean): Offender[] {
  const root = process.cwd()
  const offenders: Offender[] = []
  for (const dir of ['lib', 'app']) {
    for (const file of walk(resolve(root, dir))) {
      const rel = file.slice(root.length + 1).split(sep).join('/')
      if (rel === RULE_MODULE) continue
      const src = stripComments(readFileSync(file, 'utf8'))
      if (match(src)) offenders.push({ where: rel, line: '' })
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

  it('no JS reduce accumulates a refundable money column at face value', () => {
    // `acc + Number(r.totalCents)` / `sum + o.amountCents` inside a reduce.
    // This is the shape that slipped past the first version of this guard.
    const raw = /\breduce\b[\s\S]{0,160}?\+\s*(?:Number\(\s*)?[A-Za-z_$][\w$]*\.(amountCents|totalCents)\b/
    const allowed = new Set(REDUCE_ALLOWED.map((a) => a.file))
    const offenders = scanSource((src) => raw.test(src)).filter((o) => !allowed.has(o.where))
    expect(
      offenders,
      'net each row through netCollectedCents/collectedCents (lib/net-collected.ts) before ' +
        'reducing, or add an entry to REDUCE_ALLOWED with the reason it carries no refund',
    ).toEqual([])
  })

  it('nobody open-codes the subtraction the rule exists to own', () => {
    const handRolled = /\.(amountCents|totalCents)\s*-\s*[A-Za-z_$][\w$]*\.refundedAmountCents/
    const offenders = scan((line) => handRolled.test(line))
    expect(offenders, 'use netCollectedCents rather than re-deriving amount − refunded').toEqual([])
  })
})

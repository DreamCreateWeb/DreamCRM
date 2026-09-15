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
 *     word-boundary escapes should have been, so it matched nothing and
 *     passed. It was caught by running it against the live bug — which is why
 *     the red run is the rule and not the paperwork.)
 *  4. The subtraction open-coded somewhere else, which is how one rule
 *     becomes eight again.
 *
 * All four are legal the moment the value goes through the netting rule —
 * the guard is against the RAW column, not against adding money up.
 *
 * ── RED RUNS (2026-09-14, each watched against the tree) ────────────────────
 *
 *  · reverting `lib/services/collections.ts` fails case 1 naming that file;
 *  · reverting `lib/services/shop.ts` fails case 2 naming that file;
 *  · reverting `lib/services/appointments.ts` fails case 3 naming that file;
 *  · changing one REDUCE_ALLOWED entry's `match` text fails cases 3 and 5.
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
 * that no Connect refund can reduce.
 *
 * An entry excuses one MATCH, not a file. Excusing the file would have taken
 * `[receipt]/page.tsx` — which renders a patient's refunded receipt — out of
 * reduce coverage entirely, for the sake of one justified line. That is the
 * same door the public-action guard had, and it is the door a real defect
 * walked back through when it was tested.
 *
 * Case 5 fails if an entry stops matching anything: an allowlist nobody has to
 * re-justify is where a guard goes to rot.
 */
const REDUCE_ALLOWED: Array<{ file: string; match: string; why: string }> = [
  {
    file: 'lib/services/referral-payouts.ts',
    match: 'reduce((sum, r) => sum + r.amountCents',
    why: 'sums referral_commission.amountCents — a different table with no refund column; a reversed commission is handled by reverseCommissionForInvoice, not by netting',
  },
  {
    file: 'lib/services/referrals.ts',
    match: 'reduce((s, r) => s + r.amountCents',
    why: 'same table, same reason — the void sweep totals accrued commissions',
  },
  {
    file: 'app/(portal)/patient/invoices/[receipt]/page.tsx',
    match: 'reduce((s, l) => s + l.amountCents',
    why: "sums the RECEIPT's own display LINES to derive shipping & tax; the order total it compares against goes through netCollectedCents two lines later",
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

/**
 * Whole-FILE scan for a shape that spans lines (a multi-line `reduce`), which
 * reports WHAT it matched so an exemption can name one occurrence instead of
 * silencing the file.
 */
function scanMatches(pattern: RegExp): Offender[] {
  const root = process.cwd()
  const offenders: Offender[] = []
  for (const dir of ['lib', 'app']) {
    for (const file of walk(resolve(root, dir))) {
      const rel = file.slice(root.length + 1).split(sep).join('/')
      if (rel === RULE_MODULE) continue
      const src = stripComments(readFileSync(file, 'utf8'))
      for (const m of Array.from(src.matchAll(pattern))) {
        offenders.push({ where: rel, line: m[0].replace(/\s+/g, ' ').trim() })
      }
    }
  }
  return offenders
}

/** One allowance per listed match — a SECOND identical one still fails. */
function unexcusedReduces(found: Offender[]): Offender[] {
  const budget = new Map<string, number>()
  for (const a of REDUCE_ALLOWED) {
    const key = `${a.file} ${a.match}`
    budget.set(key, (budget.get(key) ?? 0) + 1)
  }
  return found.filter((o) => {
    const key = `${o.where} ${o.line}`
    const left = budget.get(key) ?? 0
    if (left > 0) {
      budget.set(key, left - 1)
      return false
    }
    return true
  })
}

/** `acc + Number(r.totalCents)` / `sum + o.amountCents` inside a reduce. */
const REDUCE_PATTERN =
  /\breduce\b[\s\S]{0,160}?\+\s*(?:Number\(\s*)?[A-Za-z_$][\w$]*\.(amountCents|totalCents)\b/g

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
    expect(
      unexcusedReduces(scanMatches(REDUCE_PATTERN)),
      'net each row through netCollectedCents/collectedCents (lib/net-collected.ts) before ' +
        'reducing, or add an entry to REDUCE_ALLOWED naming that exact match and why it ' +
        'carries no refund',
    ).toEqual([])
  })

  it('nobody open-codes the subtraction the rule exists to own', () => {
    const handRolled = /\.(amountCents|totalCents)\s*-\s*[A-Za-z_$][\w$]*\.refundedAmountCents/
    const offenders = scan((line) => handRolled.test(line))
    expect(offenders, 'use netCollectedCents rather than re-deriving amount − refunded').toEqual([])
  })

  it('every REDUCE_ALLOWED entry still excuses something real', () => {
    // An entry that no longer matches is either a fixed defect nobody deleted
    // or a typo silently excusing nothing — both worth failing over.
    const found = scanMatches(REDUCE_PATTERN)
    const stale = REDUCE_ALLOWED.filter(
      (a) => !found.some((o) => o.where === a.file && o.line === a.match),
    ).map((a) => `${a.file} — ${a.match}`)
    expect(stale, 'delete the entry, or fix the match text it was meant to name').toEqual([])
  })
})

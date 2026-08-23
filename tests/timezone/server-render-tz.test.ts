import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join, basename } from 'node:path'

/**
 * EVERY SERVER-RENDERED TIME STRING NAMES A TIMEZONE.
 *
 * WHY THIS GUARD EXISTS. Prod runs in UTC and clinics do not. A bare
 * `toLocaleString` on the server renders a 1 PM Central visit as "6:00 PM",
 * and a bare `toLocaleDateString` renders a 7:30 PM Central anything as
 * TOMORROW. That is the exact bug this codebase has already been bitten by,
 * CLAUDE.md states it as law, and `lib/format-datetime.ts` exists so a call
 * site cannot forget — but nothing stopped a NEW page from declaring its own
 * two-line `fmtDate` with no zone at all, which is how four of them ended up
 * in the tree at once.
 *
 * SCOPE IS PROVABLY-SERVER FILES ONLY: `page.tsx` / `layout.tsx` / `route.ts`
 * without a 'use client' banner, plus `lib/services/**`, which is
 * server-only by convention. A component file without the banner proves
 * NOTHING — it may be imported by a client component and run in the browser,
 * where the viewer's own zone is the right answer for staff (CLAUDE.md).
 * Guessing at that would make this guard noisy, and a noisy guard gets
 * an allowlist entry instead of a fix.
 */

/** Receivers that read as a date rather than a number. */
const DATEY = /(date|At\b|time|day|start|end|created|occurred|expires|scheduled|sent|due|when|stamp)/i

/** The client-side formatters in lib/utils — correct in a browser, wrong on
 *  a server, and their own file says so. */
const CLIENT_FORMATTERS = new Set(['formatDate', 'formatShortDate', 'formatTime', 'relativeTime'])

/** Deliberate, each with the reason it is right. */
const ALLOWED: Array<{ file: string; why: string }> = [
  {
    file: 'app/(default)/ecommerce/customers/[id]/page.tsx',
    why: 'the PLATFORM owner’s view of a clinic account — no clinic clock applies to a signup date or an invoice',
  },
  {
    file: 'app/(default)/ecommerce/invoices/page.tsx',
    why: 'the platform’s own subscription invoices, read by the platform owner',
  },
  {
    file: 'app/(default)/ecommerce/orders/page.tsx',
    why: 'the platform’s own order list, read by the platform owner',
  },
  {
    file: 'app/(default)/ecommerce/(cart)/cart-3/page.tsx',
    why: 'template checkout page, not a clinic surface',
  },
  {
    file: 'app/(default)/partners/[id]/page.tsx',
    why: 'a referral partner’s payout history — a partner is not in a clinic',
  },
  {
    file: 'app/(partner)/partner/page.tsx',
    why: 'the partner’s own portal — again, no clinic clock',
  },
  {
    file: 'app/(default)/website/page.tsx',
    why: 'a Y-M-D CALENDAR date parsed as local midnight and rendered in that same zone; a timezone here would shift the axis a day',
  },
]

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith('.ts') || full.endsWith('.tsx')) out.push(full)
  }
  return out
}

const SERVER_FILES = new Set([
  'page.tsx',
  'layout.tsx',
  'route.ts',
  'template.tsx',
  'default.tsx',
  'opengraph-image.tsx',
])

function isProvablyServer(rel: string, text: string): boolean {
  if (/^\s*['"]use client['"]/.test(text)) return false
  if (SERVER_FILES.has(basename(rel))) return true
  return rel.startsWith('lib/services/')
}

/** Resolve an options object passed by NAME — `{ ...dayOpts }` carries a
 *  timezone just as surely as an inline literal does, and reading only the
 *  call site would have flagged the appointments agenda, which is correct. */
function optionsCarryTimeZone(text: string, callEnd: number): boolean {
  const window = text.slice(callEnd - 1, callEnd + 350)
  if (window.includes('timeZone')) return true
  for (const m of Array.from(window.matchAll(/\b([A-Za-z_$][A-Za-z0-9_$]*)\b/g)).slice(0, 12)) {
    const name = m[1]
    if (name.length < 3) continue
    const decl = new RegExp(`(?:const|let)\\s+${name}\\s*=\\s*\\{[^}]*timeZone`, 's')
    if (decl.test(text)) return true
  }
  return false
}

describe('server-rendered times name their timezone', () => {
  const root = process.cwd()
  const files = ['lib', 'app'].flatMap((d) => walk(resolve(root, d)))

  it('no provably-server file renders a date or time without one', () => {
    const offenders: string[] = []
    for (const file of files) {
      const rel = file.slice(root.length + 1)
      const text = readFileSync(file, 'utf8')
      if (!isProvablyServer(rel, text)) continue
      if (ALLOWED.some((a) => a.file === rel)) continue

      for (const m of Array.from(
        text.matchAll(/([A-Za-z0-9_$.\]) ]+?)\.toLocale(Date|Time)?String\s*\(/g),
      )) {
        const [, receiver, kind] = m
        if (optionsCarryTimeZone(text, m.index! + m[0].length)) continue
        // A plain `.toLocaleString()` on a COUNT is not a time at all.
        if (!kind && !DATEY.test(receiver) && !receiver.includes('Date')) continue
        offenders.push(`${rel}:${text.slice(0, m.index).split('\n').length}  ${m[0].trim()}`)
      }

      for (const m of Array.from(
        text.matchAll(/^import\s*\{([^}]*)\}\s*from\s*['"]@\/lib\/utils(?:\/format)?['"]/gm),
      )) {
        const named = m[1]
          .split(',')
          .map((n) => n.trim().split(/\s+as\s+/)[0])
          .filter((n) => CLIENT_FORMATTERS.has(n))
        if (named.length > 0) {
          offenders.push(`${rel}  imports browser-only formatter(s): ${named.join(', ')}`)
        }
      }
    }
    expect(
      offenders,
      `These render a time server-side without naming a zone, so they render\n` +
        `in UTC — a 1 PM Central visit reads "6:00 PM" and a 7:30 PM Central\n` +
        `date reads as tomorrow. Use the tz-required helpers in\n` +
        `lib/format-datetime.ts with getClinicTimeZone(orgId), or add an\n` +
        `ALLOWED entry with the reason it is right:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('the allowlist is reasons, not a dumping ground', () => {
    for (const a of ALLOWED) {
      expect(a.why.length, `${a.file} needs a real reason`).toBeGreaterThan(30)
      // The file must still exist — a stale entry silently exempts nothing
      // and hides that the guard's scope has drifted.
      expect(() => readFileSync(resolve(root, a.file), 'utf8')).not.toThrow()
    }
  })
})

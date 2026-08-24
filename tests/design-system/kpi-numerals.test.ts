import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'

/**
 * KPI NUMERALS RIDE THE NUMERAL FACE.
 *
 * v3's migration checklist says it in one line — "numerals → Geist Mono
 * where KPI/money/time/count" — because Nunito's rounded figures are lovely
 * in a sentence and mushy in a column of numbers a person is comparing. The
 * pairing is `font-mono-num` + `tabular-nums`: the first picks the face, the
 * second stops digits from changing width as a count ticks.
 *
 * `tabular-nums` at a KPI size WITHOUT `font-mono-num` is therefore a
 * half-applied recipe — somebody reached for the second half and missed the
 * first — and it reads as a slightly-wrong tile beside a dozen right ones,
 * which is the least likely kind of thing to get reported and the easiest to
 * fix. One violation survived the v3 migration; this stops the second.
 *
 * SCOPE: the dashboard tenants only. The public clinic sites, the patient
 * portal and the marketing site each carry their own type system and their
 * own faces.
 */

const SKIP = ['(portal)', 'clinic-site', '/site/', '(marketing)', '(pay)', '(preview)']
const KPI_SIZE = /text-(xl|2xl|3xl|4xl|5xl)\b/

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith('.tsx')) out.push(full)
  }
  return out
}

describe('KPI numerals', () => {
  const root = process.cwd()
  const files = ['app', 'components']
    .flatMap((d) => walk(resolve(root, d)))
    .filter((f) => !SKIP.some((s) => f.includes(s)))

  it('never wear tabular-nums at KPI size without the numeral face', () => {
    const offenders: string[] = []
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      for (const m of Array.from(text.matchAll(/className=(?:"|\{`|')([^"`']{0,400}?)(?:"|`|')/g))) {
        const cls = m[1]
        if (!cls.includes('tabular-nums')) continue
        if (cls.includes('font-mono-num')) continue
        if (!KPI_SIZE.test(cls)) continue
        offenders.push(`${file.slice(root.length + 1)}:${text.slice(0, m.index).split('\n').length}`)
      }
    }
    expect(
      offenders,
      `tabular-nums at KPI size is half the recipe: it stops the digits\n` +
        `shifting but leaves them in the text face. Add \`font-mono-num\`, or\n` +
        `drop tabular-nums if this is prose rather than a number to compare:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('is actually reading the dashboard tree', () => {
    // A walk that silently returns nothing passes forever.
    expect(files.length).toBeGreaterThan(200)
    expect(files.some((f) => f.includes('dashboard'))).toBe(true)
  })
})

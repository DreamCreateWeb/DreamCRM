import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'

/**
 * The "never squint" guard — enforces the DESIGN-SYSTEM.md visibility rules
 * at the source level so the 12px floor can't silently erode again:
 *  - no px font sizes below 12px (text-[10px], text-[11px], …)
 *  - no rem font sizes below 0.75rem (the portal's 0.6/0.66/0.68/0.7rem class)
 * Scope: the authed dashboard, the patient portal, and shared UI components —
 * the surfaces staff and patients read all day. (The public site is swept
 * separately; email HTML is exempt — mail clients don't zoom.)
 *
 * TWO WAYS THIS MISSED ITS OWN DEFECT, both found by the DREAMCRM-50 mutation
 * pass — reintroduce the class, watch the guard stay green:
 *
 * 1. SCOPE. "Shared UI components" was spelled `components/ui`, which left 31
 *    dashboard component files unswept: `search-modal.tsx`,
 *    `dropdown-notifications.tsx`, `dropdown-profile.tsx`, the onboarding and
 *    followups trees. That is chrome staff read all day — exactly what the
 *    paragraph above claims to cover. The scan now takes `components` whole
 *    and subtracts the trees that own their own type systems, so a new
 *    component directory is covered the day it is created rather than the day
 *    somebody remembers to add it to a list.
 *
 * 2. SPELLING. The floors were regex branches enumerating the literals that
 *    happened to be in the tree when they were written, so `text-[11.5px]` —
 *    under the floor, and an ordinary thing to write — matched nothing. Sizes
 *    are now PARSED and COMPARED to the floor, which cannot drift from the
 *    rule the way a list of spellings does.
 */

const ROOT = resolve(__dirname, '../..')
const SCAN_DIRS = ['app/(default)', 'app/(portal)', 'app/(double-sidebar)', 'components']

/**
 * Swept by their own guards, against their own type systems.
 *
 * `components/marketing` is held to the SAME 12px floor by
 * `tests/marketing/type-floor.test.ts` (DREAMCRM-87), which grades every
 * component in both marketing trees and names the product mocks one at a time
 * — the population this skip's stated reason is about. `app/(marketing)` is in
 * that guard too rather than in `SCAN_DIRS` here, deliberately: this file's
 * header says the public site is swept separately, the marketing tree needs
 * the mock exemption and the dashboard tree does not, and two guards grading
 * one string is how they start disagreeing.
 */
const SKIP_DIRS = ['components/clinic-site', 'components/marketing']

/**
 * Files that render a FAITHFUL MOCK of somebody else's product, where the
 * small type is the thing being imitated rather than a choice we made. Same
 * reasoning as the one exemption in retired-tones.test.ts (the Google search
 * result that borrows Google's own link blue). Each needs a reason, and the
 * test below fails if one stops matching anything — a narrow allowance must
 * not outlive its subject and quietly become a blanket pardon.
 */
const ALLOWED: Array<{ file: string; why: string }> = [
  {
    file: 'components/social-posts/post-preview.tsx',
    why: 'renders the post as Instagram/Facebook/Google/TikTok will actually show it — their chrome, their type scale',
  },
  {
    file: 'components/social-posts/post-feed.tsx',
    why: 'the device-frame feed standing in for a social app; it borrows the same imitated scale as post-preview',
  },
]

/** The floor, in px. Both spellings are compared against it numerically. */
const FLOOR_PX = 12
const REM_PX = 16

/** Every arbitrary font size in the source, with its value and unit. */
const SIZE = /text-\[(\d*\.?\d+)(px|rem)\]/g

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/** The px value an arbitrary font-size class resolves to. */
export function sizeInPx(value: string, unit: string): number {
  return unit === 'rem' ? Number(value) * REM_PX : Number(value)
}

function scanned(): string[] {
  const skip = SKIP_DIRS.map((d) => join(ROOT, d))
  return SCAN_DIRS.flatMap((base) => walk(join(ROOT, base))).filter(
    (f) => !skip.some((s) => f.startsWith(s)),
  )
}

/** Every sub-floor size in a file, whatever its unit. */
function underFloor(file: string, unit?: 'px' | 'rem'): string[] {
  return Array.from(readFileSync(file, 'utf8').matchAll(SIZE))
    .filter((m) => (unit ? m[2] === unit : true) && sizeInPx(m[1], m[2]) < FLOOR_PX)
    .map((m) => m[0])
}

function offenders(unit: 'px' | 'rem'): string[] {
  const hits: string[] = []
  for (const file of scanned()) {
    const rel = relative(ROOT, file).split('\\').join('/')
    if (ALLOWED.some((a) => a.file === rel)) continue
    const under = underFloor(file, unit)
    if (under.length) hits.push(`${rel}: ${Array.from(new Set(under)).join(', ')}`)
  }
  return hits
}

describe('legibility floor (DESIGN-SYSTEM.md visibility rules)', () => {
  it('no px font sizes below 12px anywhere in the dashboard/portal/shared UI', () => {
    const hits = offenders('px')
    expect(hits, `sub-12px px sizes found:\n${hits.join('\n')}`).toEqual([])
  })

  it('no rem font sizes below 0.75rem (12px) either', () => {
    const hits = offenders('rem')
    expect(hits, `sub-0.75rem sizes found:\n${hits.join('\n')}`).toEqual([])
  })

  it('grades a size by its VALUE, not by a list of spellings', () => {
    // Both directions, because the floor is only as good as the parse.
    for (const [v, u] of [
      ['11', 'px'],
      ['11.5', 'px'],
      ['1', 'px'],
      ['0.7', 'rem'],
      ['0.65', 'rem'],
      ['.7', 'rem'],
    ] as const) {
      expect(sizeInPx(v, u), `${v}${u} should be under the floor`).toBeLessThan(FLOOR_PX)
    }
    for (const [v, u] of [
      ['12', 'px'],
      ['12.5', 'px'],
      ['14', 'px'],
      ['0.75', 'rem'],
      ['1', 'rem'],
    ] as const) {
      expect(sizeInPx(v, u), `${v}${u} should clear the floor`).toBeGreaterThanOrEqual(FLOOR_PX)
    }
    // …and the pattern has to actually find them in a class string.
    const found = Array.from('text-[11.5px] text-[.7rem] text-sm'.matchAll(SIZE)).map((m) => m[0])
    expect(found).toEqual(['text-[11.5px]', 'text-[.7rem]'])
  })

  it('every exemption still has a subject and a reason', () => {
    // An exemption that stops matching anything is a blanket pardon waiting to
    // happen: the file gets cleaned up, nobody removes the entry, and the next
    // sub-12px size added there is exempt for a reason that no longer exists.
    for (const a of ALLOWED) {
      expect(a.why.length, `${a.file} needs a real reason`).toBeGreaterThan(30)
      expect(
        underFloor(join(ROOT, a.file)).length,
        `${a.file} no longer has a sub-floor size — delete its exemption`,
      ).toBeGreaterThan(0)
    }
  })

  it('reads the dashboard chrome, not just components/ui', () => {
    // The scope miss this guard shipped with. A bare count would not have
    // caught it, so name two of the files that were outside.
    const files = scanned().map((f) => relative(ROOT, f).split('\\').join('/'))
    expect(files.length).toBeGreaterThan(400)
    expect(files).toContain('components/search-modal.tsx')
    expect(files).toContain('components/dropdown-notifications.tsx')
    expect(files.some((f) => f.startsWith('components/clinic-site/'))).toBe(false)
  })
})

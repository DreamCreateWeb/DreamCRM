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
 */

const ROOT = resolve(__dirname, '../..')
const SCAN_DIRS = [
  'app/(default)',
  'app/(portal)',
  'app/(double-sidebar)',
  'components/ui',
  'components/patient-portal',
]

// px literals under 12: text-[1px] … text-[11px]
const PX_BELOW_FLOOR = /text-\[(?:[1-9]|1[01])px\]/g
// rem literals under 0.75: text-[0.0…] – text-[0.74…]rem. The 7-branch makes
// its digits optional so bare "0.7rem" (11.2px — below the floor) is caught
// too, while "0.75rem"+ stays allowed.
const REM_BELOW_FLOOR = /text-\[0\.(?:[0-6]\d*|7(?:[0-4]\d*)?)rem\]/g

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

function offenders(pattern: RegExp): string[] {
  const hits: string[] = []
  for (const base of SCAN_DIRS) {
    for (const file of walk(join(ROOT, base))) {
      const src = readFileSync(file, 'utf8')
      const found = src.match(pattern)
      if (found) hits.push(`${relative(ROOT, file)}: ${Array.from(new Set(found)).join(', ')}`)
    }
  }
  return hits
}

describe('legibility floor (DESIGN-SYSTEM.md visibility rules)', () => {
  it('no px font sizes below 12px anywhere in the dashboard/portal/shared UI', () => {
    const hits = offenders(PX_BELOW_FLOOR)
    expect(hits, `sub-12px px sizes found:\n${hits.join('\n')}`).toEqual([])
  })

  it('no rem font sizes below 0.75rem (12px) either', () => {
    const hits = offenders(REM_BELOW_FLOOR)
    expect(hits, `sub-0.75rem sizes found:\n${hits.join('\n')}`).toEqual([])
  })
})

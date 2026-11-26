import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FEATURE_BY_KEY, FEATURE_SWITCHES, doorsOpenedBy } from '@/lib/feature-switches'

/**
 * EVERY SWITCH COLUMN IS READ WHERE THE SWITCHES ARE READ.
 *
 * Adding a feature switch touches four lists that nothing but a person kept
 * in step: the registry, the one sidebar read, the daily reconcile's row
 * select, and the demo's self-heal. Miss one and the failure is quiet —
 *
 *  - missing from the sidebar read: `Boolean(undefined)` → the door is
 *    closed forever for everyone, whatever the column says;
 *  - missing from the reconcile's select: `undefined == null` → an A1 door
 *    is "owed" on every clinic every day, and the walk never gets shorter;
 *  - missing from the demo's self-heal: a prospect mid-pitch meets an "Add"
 *    group in the one clinic that is supposed to show the whole app.
 *
 * Found by adding the Huddle (docs/daily-tools.md, H1): the reconcile's
 * select named My Day and Follow-ups by hand.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('feature-switch columns are read everywhere they must be', () => {
  it('the one sidebar read selects every switch column', () => {
    const src = read('lib/services/feature-switches.ts')
    for (const f of FEATURE_SWITCHES) {
      expect(src, `${f.key} → ${f.column}`).toContain(`${f.column}: schema.clinicProfile.${f.column}`)
    }
  })

  it('the daily activation reconcile selects every A1 door’s column', () => {
    const src = read('lib/services/activation.ts')
    expect(doorsOpenedBy('a1').length).toBeGreaterThan(0)
    for (const key of doorsOpenedBy('a1')) {
      const column = FEATURE_BY_KEY[key].column
      expect(src, `${key} → ${column}`).toContain(`${column}: schema.clinicProfile.${column}`)
      // …and the type the row is read through names it.
      expect(src, `${key} in A1DoorColumn`).toMatch(new RegExp(`type A1DoorColumn = [^\\n]*'${column}'`))
    }
  })

  it('the demo clinic’s self-heal turns every switch on', () => {
    const src = read('lib/services/demo-clinic/index.ts')
    for (const f of FEATURE_SWITCHES) {
      expect(src, `${f.key} read`).toContain(`${f.column}: schema.clinicProfile.${f.column}`)
      expect(src, `${f.key} stamped`).toContain(`patch.${f.column} = new Date()`)
    }
  })
})

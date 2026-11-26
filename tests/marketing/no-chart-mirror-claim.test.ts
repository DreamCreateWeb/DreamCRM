import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { COMPARISONS, buildComparisonFaq } from '@/lib/marketing/comparisons'
import { DOCS } from '@/lib/marketing/docs'

/**
 * "AN OD CHART MIRROR" — a feature the public pages claimed and no practice
 * can use, held at zero.
 *
 * The product page's intake-forms card and one comparison entry said intake
 * forms come with "an OD chart mirror": a copy of the completed form written
 * into the patient's chart. The code that does it is real
 * (`lib/services/forms.ts` queues a comm-log write). But the only PMS
 * connection a practice can make today is NexHealth, and the NexHealth client
 * refuses that write in so many words: "NexHealth does not support comm-log
 * mirroring." The direct Open Dental path, which did support it, was removed
 * on 2026-08-19. So the sentence described something that runs for nobody.
 *
 * Found on 2026-11-26 while the Podium entry was being read against what is
 * true. Same class as the website export promised in nine places and built
 * nowhere (`no-website-export-claim.test.tsx`): a line about our own product
 * that nobody had checked against the product.
 *
 * This reads four named surfaces, not the tree.
 */
const ROOT = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8')

const CLAIM = /chart mirror|copy (?:of (?:it|the form) )?in (?:the|your|their) chart|into the (?:patient’s|patient's) chart/i

describe('the chart-mirror claim', () => {
  it('the connection a practice can make today refuses the write', () => {
    // If this line ever goes, the feature may be real again: re-read the
    // client, and the pages below may then say so.
    expect(read('lib/services/pms/nexhealth.ts')).toContain('NexHealth does not support comm-log mirroring.')
  })

  it('the detector finds the claim in the spellings it shipped in', () => {
    for (const was of [
      'Spanish, kiosk mode, and an OD chart mirror.',
      'recall on PMS due dates, an OD chart mirror — none of which',
      'a copy in your chart',
    ]) {
      expect(CLAIM.test(was), was).toBe(true)
    }
    expect(CLAIM.test('A chart of new patients, measured against the prior window.')).toBe(false)
  })

  it('the product page does not make it', () => {
    expect(read('app/(marketing)/product/page.tsx')).not.toMatch(CLAIM)
  })

  it('no comparison entry, comparison answer or help article makes it', () => {
    for (const c of COMPARISONS) {
      expect(JSON.stringify(c), c.slug).not.toMatch(CLAIM)
      for (const f of buildComparisonFaq(c)) expect(f.a, `${c.slug}: ${f.q}`).not.toMatch(CLAIM)
    }
    expect(JSON.stringify(DOCS)).not.toMatch(CLAIM)
  })
})

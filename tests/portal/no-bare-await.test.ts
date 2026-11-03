import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { scanTree } from '../ui/no-bare-await.test'

/**
 * ML-03 — a patient mid-tap on a survey, plan, booking or review page is
 * never stranded by a deploy. The tree-wide ratchet in
 * tests/ui/no-bare-await.test.ts holds the allowlist; this is the
 * PER-DIRECTORY PIN: the patient-facing surfaces below sit at ZERO bare
 * awaits of a server action, so an allowlist entry can never be re-added for
 * them by hand. It reuses that file's detector (`scanTree`) — never a second
 * parser.
 *
 * Deliberately NOT here: /b, /c, /w (they catch already), and /e (the
 * conference floor capture page — staff-run, its own entry stays on the
 * allowlist until its own slice).
 */
const PATIENT_FACING = [
  /^app\/\(portal\)\//,
  /^app\/n\/\[token\]\//,
  /^app\/i\/\[token\]\//,
  /^app\/d\/\[token\]\//,
  /^app\/r\/\[token\]\//,
  /^components\/patient-portal\//,
]

const mine = (file: string) => PATIENT_FACING.some((re) => re.test(file))

describe('patient-facing pages never bare-await a server action', () => {
  const sites = scanTree().filter((s) => mine(s.file))

  it('holds every portal and token-page directory at zero bare awaits', () => {
    const bare = sites.filter((s) => !s.guarded).map((s) => `${s.file}:${s.line} await ${s.callee}(`)
    expect(
      bare,
      'wrap it: `await runAction(() => action(…), PORTAL_RUN)` (lib/run-action.ts + components/patient-portal/stale-reload.tsx), ' +
        'show the error through PortalActionError / PortalReloadWhenStale, reset busy flags in a finally',
    ).toEqual([])
  })

  it('the forms that were fixed still go through runAction with the portal voice', () => {
    // An instrument check: a detector that sees no site reports CLEAN, so
    // prove the wrapper is actually in the files rather than the awaits gone.
    for (const f of [
      'app/n/[token]/survey-form.tsx',
      'app/i/[token]/plan-form.tsx',
      'app/d/[token]/booking-form.tsx',
      'app/r/[token]/review-form.tsx',
      'app/(portal)/patient/book/book-form.tsx',
      'app/(portal)/patient/invoices/pay-form.tsx',
      'app/(portal)/patient/invoices/plan-offer.tsx',
      'components/patient-portal/survey-card.tsx',
      'components/patient-portal/loyalty-card.tsx',
      'components/patient-portal/visit-card.tsx',
    ]) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).toMatch(/runAction\(/)
      expect(src, f).toMatch(/PORTAL_RUN/)
    }
  })

  it('the portal layout mounts the portal-flavoured BuildWatch', () => {
    expect(readFileSync('app/(portal)/layout.tsx', 'utf8')).toMatch(/<PortalBuildWatch \/>/)
  })
})

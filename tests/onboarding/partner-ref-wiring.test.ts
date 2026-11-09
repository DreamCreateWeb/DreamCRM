import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** ML-46 wiring: the cookie is set only on marketing landings, carries only the
 *  code, and sign-up credits it once (new orgs only), before no Stripe call. */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('partner_ref wiring', () => {
  it('middleware sets the 30-day code-only cookie inside the marketing-landing gate', () => {
    const mw = read('middleware.ts')
    const gate = mw.indexOf('if (!isAttributionLanding(request.nextUrl.pathname)) return res')
    const set = mw.indexOf("res.cookies.set('partner_ref'")
    expect(gate).toBeGreaterThan(0)
    expect(set).toBeGreaterThan(gate)
    expect(mw).toMatch(/\^\[a-z0-9\]\{6,16\}\$/)
    expect(mw).toMatch(/maxAge: 30 \* 24 \* 60 \* 60/)
  })
  it('sign-up attributes only when it created the org, and never touches Stripe', () => {
    const src = read('app/(onboarding)/actions.ts')
    expect(src).toMatch(/if \(isNewOrg\) try \{\s*const \{ attributeSignupToPartner, PARTNER_REF_COOKIE \}/)
  })
})

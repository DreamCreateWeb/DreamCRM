import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The audit finding: Settings → Billing listed `invoices` rows with NO
 * organization filter (a cross-tenant leak). The fix deletes that query and
 * reads org-scoped Stripe invoices instead. These are source-level guards so
 * the leak can't quietly come back, plus a check that the page now reads truth
 * from the org-scoped clinic_profile path (tenant context + billing service).
 */
const root = resolve(__dirname, '../../')
const billingPage = readFileSync(resolve(root, 'app/(default)/settings/billing/page.tsx'), 'utf8')
const plansPage = readFileSync(resolve(root, 'app/(default)/settings/plans/page.tsx'), 'utf8')

describe('Settings → Billing — no cross-tenant invoice leak', () => {
  it('no longer queries the shared `invoices` table at all', () => {
    expect(billingPage).not.toMatch(/schema\.invoices/)
    expect(billingPage).not.toMatch(/from\(schema\.invoices\)/)
  })

  it('does not read the user-keyed billingProfiles via getBilling', () => {
    expect(billingPage).not.toMatch(/getBilling/)
  })

  it('reads invoices through the org-scoped Stripe service', () => {
    expect(billingPage).toMatch(/listOrgStripeInvoices\(ctx\.organizationId/)
  })

  it('derives status/plan from the tenant context (org-scoped clinic_profile)', () => {
    expect(billingPage).toMatch(/requireTenant/)
    expect(billingPage).toMatch(/ctx\.planTier/)
    expect(billingPage).toMatch(/subscriptionStatus/)
  })
})

describe('Settings → Plan — reads the truth, not billingProfiles', () => {
  it('no longer reads getBilling / the user-keyed billing plan', () => {
    expect(plansPage).not.toMatch(/getBilling/)
  })

  it('passes the real plan tier from tenant context into the panel', () => {
    expect(plansPage).toMatch(/requireTenant/)
    expect(plansPage).toMatch(/currentPlanId=\{ctx\.planTier\}/)
    expect(plansPage).toMatch(/subscriptionStatus=\{ctx\.subscriptionStatus/)
  })
})

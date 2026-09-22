import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE WRITERS OF THE NEWLY-CACHED CHROME DROP THE TAG.
 *
 * Moving the layout's eleven columns into the durable cache bought a database
 * round trip per public page view and took on one obligation: whoever writes
 * one of those columns has to say so, or the clinic's own site disagrees with
 * their own settings page for up to `CACHE_TTL_SECONDS`.
 *
 * Three writers are in scope, and they are NOT the whole set — the TTL is the
 * contract and completeness here is a trap (see `CACHE_TTL_SECONDS`). These
 * three are the ones where the staleness is either watched by a human in real
 * time or points the wrong way:
 *
 *   - the "Powered by" credit and the chat bubble: the clinic flips the
 *     switch, reloads their own site, and has no way to tell why nothing
 *     changed. Neither goes through `stageWebsiteValues`, so neither was
 *     covered by the publish chokepoint.
 *   - the Stripe subscription webhook: `subscriptionStatus` and
 *     `stripeSubscriptionId` are two thirds of `resolveTrialState`, which
 *     decides whether the public site serves AT ALL. The expiry half is
 *     time-based and resolved per request, so a trial running out still walls
 *     the site instantly — but a clinic PAYING is a write, and without this
 *     the money has landed and their site stays dark.
 *
 * `{ expire: 0 }` is load-bearing rather than decoration: only an immediate
 * expiry gives read-your-own-writes. Both tags, because the site payload is
 * keyed on orgId and the theme (which carries the chrome) on slug.
 */

let tenantCtx: {
  tenantType: string
  role: string
  organizationId: string
  organizationSlug: string
} | null = null

vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => {
    if (!tenantCtx) throw new Error('Not authenticated')
    return tenantCtx
  }),
}))

/**
 * `revalidateTag` is a `vi.fn` here so the assertions can read the ARGUMENTS,
 * and so a test can make it refuse the way Next refuses during a render.
 */
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

vi.mock('@/lib/services/realtime', () => ({ publishRealtime: vi.fn(async () => {}) }))

/** The over-cap social disconnect — the money-path work that a throw in the
 *  invalidation used to skip. Mocked so the tests can ask whether it RAN. */
const enforceSocialConnectionCap = vi.fn(async () => {})
vi.mock('@/lib/services/social-billing', () => ({ enforceSocialConnectionCap }))

/** The Stripe subscription `syncSubscriptionFromStripe` will be handed. */
const stripeSub = {
  id: 'sub_123',
  status: 'active',
  customer: 'cus_123',
  metadata: { organizationId: 'org_1' },
  items: { data: [{ id: 'si_1', price: { id: 'price_unknown' } }] },
}
vi.mock('@/lib/stripe', () => ({
  stripe: { subscriptions: { retrieve: vi.fn(async () => stripeSub) } },
}))

const updates: Array<{ table: string; values: Record<string, unknown> }> = []

/** The `clinic_profile` row read back as `prev` by the subscription sync. */
const profileRow: Record<string, unknown> = {
  organizationId: 'org_1',
  slug: 'acme',
  socialAddon: 1,
  // A tier that DIFFERS from what the sync will resolve, so `entitlementShrank`
  // is true and the over-cap enforcement is actually reached. That is the
  // scenario from the review: a clinic leaving the full-Premium trial for a
  // smaller plan.
  planTier: 'pro',
}

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<typeof import('@/lib/db/schema')>('@/lib/db/schema')
  const nameOf = (t: unknown) =>
    String((t as Record<symbol, unknown>)?.[Symbol.for('drizzle:Name')] ?? '')
  return {
    schema,
    db: {
      update: (table: unknown) => ({
        set: (v: Record<string, unknown>) => ({
          where: async () => {
            updates.push({ table: nameOf(table), values: v })
          },
        }),
      }),
      // Two readers here: the sync's `prev` lookup on clinic_profile, and the
      // invalidator's slug lookup on organization. Table-aware so one fixture
      // is not silently answering both questions.
      select: () => {
        let table = ''
        const rows = () =>
          table === 'organization' ? [{ slug: 'acme' }] : [profileRow]
        const chain: Record<string, unknown> = {}
        chain.from = (t: unknown) => {
          table = nameOf(t)
          return chain
        }
        chain.where = () => chain
        chain.limit = async () => rows()
        chain.then = (resolve: (v: unknown) => void) => resolve(rows())
        return chain
      },
    },
  }
})

import { revalidateTag } from 'next/cache'
import { clinicSiteTag, clinicSiteSlugTag } from '@/lib/services/clinic-site-cache'

beforeEach(() => {
  updates.length = 0
  // `mockReset`, not `mockClear`: the render-refusal tests install a throwing
  // implementation, and clearing only wipes the CALL LOG. One test leaking its
  // implementation into the next would make the happy-path assertions above
  // fail for a reason that has nothing to do with the code under test.
  vi.mocked(revalidateTag).mockReset()
  enforceSocialConnectionCap.mockClear()
  tenantCtx = {
    tenantType: 'clinic',
    role: 'owner',
    organizationId: 'org_1',
    organizationSlug: 'acme',
  }
})

function expectBothTagsDropped() {
  expect(revalidateTag).toHaveBeenCalledWith(clinicSiteTag('org_1'), { expire: 0 })
  expect(revalidateTag).toHaveBeenCalledWith(clinicSiteSlugTag('acme'), { expire: 0 })
}

describe('the "Powered by" switch', () => {
  it('writes the column AND drops both tags', async () => {
    const { setPoweredByVisibilityAction } = await import(
      '@/app/(default)/website/design/actions'
    )
    const res = await setPoweredByVisibilityAction(true)

    expect(res).toEqual({ ok: true })
    expect(updates.find((u) => u.table === 'clinic_profile')?.values.hidePoweredBy).toBe(true)
    expectBothTagsDropped()
  })

  it('invalidates nothing when the gate refuses the caller', async () => {
    tenantCtx = {
      tenantType: 'clinic',
      role: 'member',
      organizationId: 'org_1',
      organizationSlug: 'acme',
    }
    const { setPoweredByVisibilityAction } = await import(
      '@/app/(default)/website/design/actions'
    )
    const res = await setPoweredByVisibilityAction(true)

    expect(res).toEqual({ ok: false, error: 'Only an owner or admin can change this.' })
    expect(updates).toEqual([])
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})

describe('the chat-bubble toggle', () => {
  it('writes the column AND drops both tags', async () => {
    const { saveChatWidgetAction } = await import('@/app/(default)/website/forms/actions')
    const res = await saveChatWidgetAction(false)

    expect(res).toEqual({ ok: true })
    expect(updates.find((u) => u.table === 'clinic_profile')?.values.chatWidgetEnabled).toBe(false)
    // `revalidatePath('/site/acme', 'layout')` is NOT enough on its own and
    // was all this action did: the layout reads the toggle from the per-clinic
    // TAGGED payload, which a path revalidation does not touch.
    expectBothTagsDropped()
  })
})

describe('the Stripe subscription webhook', () => {
  it('a cleared subscription drops the clinic site cache', async () => {
    const { clearSubscription } = await import('@/lib/services/billing')
    await clearSubscription('sub_123')

    expect(updates.find((u) => u.table === 'clinic_profile')?.values.subscriptionStatus).toBe(
      'canceled',
    )
    expectBothTagsDropped()
  })

  /**
   * THE PAYING DIRECTION — AND THE DEFECT THAT HID BEHIND ITS FIRST TEST.
   *
   * The first version of this block asserted the paying direction by GREPPING
   * `billing.ts` for the string `invalidateClinicSiteForOrg`. The string was
   * present. The call threw. Sentinel found it in review on #654, and the
   * lesson generalises: a source-text test cannot see the phase a call runs
   * in, or what happens to the lines after it.
   *
   * So the sync is driven for real now, and each test below asks a question
   * the grep could not.
   */
  describe('syncSubscriptionFromStripe', () => {
    it('writes the columns, enforces the cap, and drops both tags', async () => {
      const { syncSubscriptionFromStripe } = await import('@/lib/services/billing')
      await syncSubscriptionFromStripe('sub_123')

      const write = updates.find((u) => u.table === 'clinic_profile')
      expect(write?.values.subscriptionStatus).toBe('active')
      expect(
        enforceSocialConnectionCap,
        'the over-cap social disconnect never ran — each connection it leaves\n' +
          'up is billable to the platform',
      ).toHaveBeenCalledWith('org_1')
      expectBothTagsDropped()
    })

    /**
     * THE REGRESSION SENTINEL CAUGHT, PINNED.
     *
     * `app/(default)/settings/billing/page.tsx` calls this in its Server
     * Component BODY via `syncCheckoutSuccess`, and Next throws on
     * `revalidateTag` during render (E7 — proved against the real module in
     * `next-cache-contract.test.ts`, which also proves our catch recognises
     * that exact error object; the code is constructed here because what is
     * under test is the BILLING function's control flow, not Next's).
     *
     * Before the fix the throw landed between the profile write and the
     * over-cap enforcement, so a clinic activating a smaller plan kept social
     * connections the platform pays for — and `syncCheckoutSuccess` caught,
     * logged a false failure, and returned false on an activation that
     * actually succeeded.
     */
    it('a render-phase refusal does not truncate the sync', async () => {
      vi.mocked(revalidateTag).mockImplementation(() => {
        throw Object.assign(new Error('used "revalidateTag" during render'), {
          __NEXT_ERROR_CODE: 'E7',
        })
      })

      const { syncSubscriptionFromStripe } = await import('@/lib/services/billing')
      await expect(
        syncSubscriptionFromStripe('sub_123'),
        'the sync threw on the checkout-success landing — syncCheckoutSuccess\n' +
          'will log a successful activation as a failure',
      ).resolves.toBeUndefined()

      expect(updates.find((u) => u.table === 'clinic_profile')?.values.subscriptionStatus).toBe(
        'active',
      )
      expect(
        enforceSocialConnectionCap,
        'THE #654 DEFECT: the invalidation refused during render, the throw\n' +
          'truncated the function, and the over-cap social disconnect never\n' +
          'ran. A clinic leaving the full-Premium trial for a smaller plan\n' +
          'keeps connections the platform is billed for.',
      ).toHaveBeenCalledWith('org_1')
    })

    /**
     * ORDERING, PINNED SEPARATELY FROM THE TOLERANCE.
     *
     * The tolerance stops the render refusal specifically. This stops the
     * CLASS: cache bookkeeping runs last, so no future refusal — for a reason
     * nobody has thought of yet — can eat the money-path work above it. Both,
     * because either alone is one edit away from the same bug.
     */
    it('the cap is enforced even when the invalidation throws for a reason we do NOT tolerate', async () => {
      vi.mocked(revalidateTag).mockImplementation(() => {
        throw Object.assign(new Error('used inside a "use cache"'), {
          __NEXT_ERROR_CODE: 'E181',
        })
      })

      const { syncSubscriptionFromStripe } = await import('@/lib/services/billing')
      // It still surfaces — that error IS a real bug and must not be swallowed.
      await expect(syncSubscriptionFromStripe('sub_123')).rejects.toThrow(/use cache/)

      expect(
        enforceSocialConnectionCap,
        'the invalidation is still ahead of the over-cap enforcement, so any\n' +
          'throw there skips money-path work. Move it to the END of the function.',
      ).toHaveBeenCalledWith('org_1')
    })
  })
})

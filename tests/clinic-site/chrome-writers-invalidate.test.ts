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

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

vi.mock('@/lib/services/realtime', () => ({ publishRealtime: vi.fn(async () => {}) }))

const updates: Array<{ table: string; values: Record<string, unknown> }> = []

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
      // `invalidateClinicSiteForOrg` resolves the slug for the theme tag.
      select: () => {
        const chain: Record<string, unknown> = {}
        chain.from = () => chain
        chain.where = () => chain
        chain.limit = async () => [{ slug: 'acme', organizationId: 'org_1' }]
        chain.then = (resolve: (v: unknown) => void) =>
          resolve([{ slug: 'acme', organizationId: 'org_1' }])
        return chain
      },
    },
  }
})

import { revalidateTag } from 'next/cache'
import { clinicSiteTag, clinicSiteSlugTag } from '@/lib/services/clinic-site-cache'

beforeEach(() => {
  updates.length = 0
  vi.mocked(revalidateTag).mockClear()
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
  /**
   * `clearSubscription` is the half of the billing sync that needs no Stripe
   * API double — it resolves the org from the subscription id and writes.
   * Exercised here rather than `syncSubscriptionFromStripe` for that reason;
   * both call the same invalidation and the source assertion below covers the
   * other one.
   */
  it('a cleared subscription drops the clinic site cache', async () => {
    const { clearSubscription } = await import('@/lib/services/billing')
    await clearSubscription('sub_123')

    expect(updates.find((u) => u.table === 'clinic_profile')?.values.subscriptionStatus).toBe(
      'canceled',
    )
    expectBothTagsDropped()
  })

  it('the paying direction invalidates too', async () => {
    // The direction that matters most and is hardest to reach in a unit test
    // (it needs a Stripe subscription object). Asserted on the source: the
    // sync writes `subscriptionStatus` and must invalidate in the same
    // function, or a clinic pays and their site stays walled for the TTL.
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('lib/services/billing.ts', 'utf8')
    const sync = src.slice(src.indexOf('export async function syncSubscriptionFromStripe'))
    const body = sync.slice(0, sync.indexOf('\nexport '))

    expect(
      body,
      'syncSubscriptionFromStripe writes subscriptionStatus without dropping\n' +
        'the clinic-site cache — a clinic that pays keeps seeing the shut-down\n' +
        'wall on their own public site until the TTL rolls over',
    ).toContain('invalidateClinicSiteForOrg')
  })
})

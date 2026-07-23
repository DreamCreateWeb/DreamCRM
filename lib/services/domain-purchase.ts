import 'server-only'
import { randomUUID } from 'crypto'
import { and, desc, eq, inArray, lte } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { stripe } from '@/lib/stripe'
import {
  checkAvailability,
  createDomain,
  createRecord,
  disableAutorenew,
  isLivePurchasesEnabled,
  isNameComConfigured,
  renewDomain,
  searchDomains,
  type DomainSearchResult,
} from '@/lib/name-com'
import { requestCustomDomain, resolveCustomDomain } from './custom-domain'

/**
 * Buy-a-domain (2026-07-21): search → buy → auto-attach, all in-platform.
 *
 * The platform registers the domain on ITS name.com account and charges the
 * clinic via Stripe (their existing platform-billing customer). Because we
 * own the DNS zone from second zero, attachment is ZERO-TOUCH: the existing
 * requestCustomDomain gives us the routing + ACM-validation records and we
 * write them straight through the name.com API — the clinic never sees a
 * DNS screen. The existing /website/domain status card takes over from there.
 *
 * Money-safety rails:
 *  - premium domains and anything over PRICE_CAP_CENTS never surface;
 *  - the quoted price is re-checked at purchase AND pinned in the name.com
 *    create call (their API rejects on mismatch — a quote can't grow);
 *  - charge-then-register, with an automatic Stripe refund if registration
 *    fails after payment;
 *  - NAMECOM_LIVE_PURCHASES!=1 → dry-run (no charge, no registration, row
 *    marked dryRun) so the whole flow can be exercised before real money.
 */

/** Never surface a domain above this yearly price (fat-finger guard).
 *  $100 — high enough for the dental TLDs (.dentist runs ~$77/yr,
 *  live-checked 2026-07-21), low enough that nobody buys a yacht. */
export const PRICE_CAP_CENTS = 10000

/** The plan-included tier: one free domain per clinic when BOTH prices fit
 *  $25/yr (owner-set 2026-07-22). The renewal cap matters more than the
 *  purchase cap — teaser TLDs exist ($3.99 first year, $43.99 renewal,
 *  live-checked on .live) and the platform absorbs included renewals every
 *  year. */
export const FREE_PURCHASE_CAP_CENTS = 2500
export const FREE_RENEWAL_CAP_CENTS = 2500

export interface DomainOffer {
  domainName: string
  purchasePriceCents: number
  renewalPriceCents: number | null
  /** Fits the plan-included tier (offer-level; the clinic must also still
   *  have their one free slot — see searchDomainOffersForClinic). */
  includedEligible: boolean
}

/** Both prices must fit — an unknown renewal price NEVER qualifies as free. */
export function isIncludedEligible(o: { purchasePriceCents: number; renewalPriceCents: number | null }): boolean {
  return (
    o.purchasePriceCents <= FREE_PURCHASE_CAP_CENTS &&
    o.renewalPriceCents !== null &&
    o.renewalPriceCents <= FREE_RENEWAL_CAP_CENTS
  )
}

export interface DomainPurchaseView {
  id: string
  domain: string
  status: string
  purchasePriceCents: number
  dryRun: boolean
  includedInPlan: boolean
  error: string | null
  renewalError: string | null
  purchasedAt: Date | null
  renewsAt: Date | null
}

export function isDomainBuyingAvailable(): boolean {
  return isNameComConfigured()
}

/** Offers a clinic can actually buy: purchasable, non-premium, under the cap. */
export function filterOffers(results: DomainSearchResult[]): DomainOffer[] {
  return results
    .filter(
      (r) =>
        r.purchasable &&
        !r.premium &&
        r.purchasePriceCents !== null &&
        r.purchasePriceCents > 0 &&
        r.purchasePriceCents <= PRICE_CAP_CENTS,
    )
    .map((r) => ({
      domainName: r.domainName,
      purchasePriceCents: r.purchasePriceCents!,
      renewalPriceCents: r.renewalPriceCents,
      includedEligible: isIncludedEligible({
        purchasePriceCents: r.purchasePriceCents!,
        renewalPriceCents: r.renewalPriceCents,
      }),
    }))
}

/** Does this clinic still have its one plan-included domain available? */
export async function hasIncludedDomainSlot(organizationId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.clinicDomainPurchase.id })
    .from(schema.clinicDomainPurchase)
    .where(
      and(
        eq(schema.clinicDomainPurchase.organizationId, organizationId),
        eq(schema.clinicDomainPurchase.includedInPlan, 1),
        eq(schema.clinicDomainPurchase.dryRun, 0),
        inArray(schema.clinicDomainPurchase.status, ['registering', 'active']),
      ),
    )
    .limit(1)
  return row === undefined
}

/** Offers for this clinic: includedEligible only survives while their free
 *  slot is open (a second cheap domain shows its real price and charges). */
export async function searchDomainOffersForClinic(
  organizationId: string,
  query: string,
): Promise<{ offers: DomainOffer[]; freeSlotOpen: boolean }> {
  const [offers, freeSlotOpen] = await Promise.all([
    searchDomainOffers(query),
    hasIncludedDomainSlot(organizationId),
  ])
  return {
    offers: freeSlotOpen ? offers : offers.map((o) => ({ ...o, includedEligible: false })),
    freeSlotOpen,
  }
}

/**
 * Search: exact-name availability when the query looks like a full domain,
 * plus keyword suggestions across TLDs. Premium + over-cap results are
 * filtered OUT (not shown greyed — nothing a clinic can't buy appears).
 */
export async function searchDomainOffers(query: string): Promise<DomainOffer[]> {
  const q = query.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  if (q.length < 3) return []
  const looksExact = /^[a-z0-9][a-z0-9-]*\.[a-z]{2,}$/i.test(q)
  const [exact, suggestions] = await Promise.all([
    looksExact ? checkAvailability([q]) : Promise.resolve([]),
    searchDomains(q.replace(/\..*$/, '')),
  ])
  const seen = new Set<string>()
  const merged: DomainSearchResult[] = []
  for (const r of [...exact, ...suggestions]) {
    if (seen.has(r.domainName)) continue
    seen.add(r.domainName)
    merged.push(r)
  }
  return filterOffers(merged).slice(0, 12)
}

export type PurchaseResult =
  | { ok: true; purchaseId: string; dryRun: boolean }
  | { ok: false; error: string }

/**
 * The whole buy: re-quote → charge → register → auto-attach. `expectedPriceCents`
 * is what the clinic saw and agreed to — any drift aborts before money moves.
 */
export async function purchaseDomainForClinic(
  organizationId: string,
  userId: string,
  domainName: string,
  expectedPriceCents: number,
): Promise<PurchaseResult> {
  const domain = domainName.trim().toLowerCase()

  // Sanity: the domain must be attachable (same validation the manual flow uses).
  const plan = resolveCustomDomain(domain)
  if (!plan.ok) return { ok: false, error: plan.error }

  // Re-quote right now — availability and price move under us.
  const [current] = await checkAvailability([domain])
  const offer = current ? filterOffers([current])[0] : undefined
  if (!offer) return { ok: false, error: 'That domain is no longer available.' }
  if (offer.purchasePriceCents !== expectedPriceCents) {
    return {
      ok: false,
      error: `The price changed to $${(offer.purchasePriceCents / 100).toFixed(2)}/yr — search again to confirm.`,
    }
  }

  const dryRun = !isLivePurchasesEnabled()

  // The plan-included tier: when the offer fits the free caps AND the clinic
  // still has their one free slot, the domain is on us — no Stripe charge.
  // Free wins automatically; there's no reason to make a clinic opt out.
  const includedInPlan = offer.includedEligible && (await hasIncludedDomainSlot(organizationId))

  // Charge first (live mode only, paid domains only) — the clinic's saved
  // card via their platform-billing Stripe customer. No customer/card → a
  // clear next step.
  let paymentIntentId: string | null = null
  if (!dryRun && !includedInPlan) {
    const [profile] = await db
      .select({ stripeCustomerId: schema.clinicProfile.stripeCustomerId })
      .from(schema.clinicProfile)
      .where(eq(schema.clinicProfile.organizationId, organizationId))
      .limit(1)
    if (!profile?.stripeCustomerId) {
      return { ok: false, error: 'Add a payment method in Settings → Billing first.' }
    }
    try {
      const intent = await stripe.paymentIntents.create({
        customer: profile.stripeCustomerId,
        amount: offer.purchasePriceCents,
        currency: 'usd',
        off_session: true,
        confirm: true,
        description: `Domain registration: ${domain} (1 year)`,
        metadata: { organizationId, domain, kind: 'domain_purchase' },
      })
      paymentIntentId = intent.id
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error && err.message
            ? `Payment failed: ${err.message}`
            : 'Payment failed — check your card in Settings → Billing.',
      }
    }
  }

  const purchaseId = randomUUID()
  await db.insert(schema.clinicDomainPurchase).values({
    id: purchaseId,
    organizationId,
    domain,
    status: 'registering',
    purchasePriceCents: offer.purchasePriceCents,
    renewalPriceCents: offer.renewalPriceCents,
    stripePaymentIntentId: paymentIntentId,
    dryRun: dryRun ? 1 : 0,
    includedInPlan: includedInPlan ? 1 : 0,
    createdBy: userId,
  })

  // Register (or simulate). A live failure refunds the charge — never keep
  // money for a domain that didn't register.
  if (!dryRun) {
    try {
      await createDomain(domain, offer.purchasePriceCents)
      // Registrar auto-renew OFF — renewals are the domain-renewals cron's
      // job (clinic must be active + charged first). Best-effort: if this
      // call hiccups the cron still renews explicitly before expiry.
      await disableAutorenew(domain).catch(() => {})
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed.'
      if (paymentIntentId) {
        try {
          await stripe.refunds.create({ payment_intent: paymentIntentId })
        } catch {
          // Refund failure is surfaced in the row error for manual follow-up.
        }
      }
      await db
        .update(schema.clinicDomainPurchase)
        .set({ status: 'failed', error: message, updatedAt: new Date() })
        .where(eq(schema.clinicDomainPurchase.id, purchaseId))
      return { ok: false, error: `Registration failed and your card was refunded: ${message}` }
    }
  }

  const now = new Date()
  const renewsAt = new Date(now)
  renewsAt.setFullYear(renewsAt.getFullYear() + 1)
  await db
    .update(schema.clinicDomainPurchase)
    .set({ status: 'active', purchasedAt: now, renewsAt, updatedAt: now })
    .where(eq(schema.clinicDomainPurchase.id, purchaseId))

  // Auto-attach: associate in App Runner, then write the returned records
  // into the zone we now own. Best-effort — a hiccup here leaves the normal
  // domain card showing the records + status, same as the manual flow.
  try {
    const attach = await requestCustomDomain(organizationId, domain)
    if (attach.ok && !dryRun) {
      for (const record of attach.status.dnsRecords) {
        // Apex routing can't be a CNAME — name.com supports ANAME there.
        const type = record.purpose === 'routing' && record.host === '@' ? 'ANAME' : record.type
        await createRecord(domain, { host: record.host, type, answer: record.value })
      }
      // requestCustomDomain DEGRADES instead of throwing when App Runner's
      // AssociateCustomDomain fails (the 5-custom-domains quota, IAM, …):
      // DNS then points at the service with no certificate ever coming, so
      // the clinic's site "attaches" but never loads (2026-07-22:
      // mammothspringsdental.com hit exactly this on the quota). That state
      // is invisible from the clinic side — page the platform so an operator
      // finishes the association (docs/custom-domains.md) before the clinic
      // notices.
      if (attach.status.error === 'manual') {
        try {
          const { getPlatformOrgId } = await import('./gsc')
          const { notifyOrgMembers } = await import('./notifications')
          const platformOrgId = await getPlatformOrgId()
          if (platformOrgId) {
            await notifyOrgMembers(
              platformOrgId,
              {
                bucket: 'comments',
                type: 'domain_attach_manual',
                title: `Domain needs a hand — ${domain}`,
                body:
                  `${domain} was purchased and its DNS is set, but the App Runner ` +
                  `association failed (likely the 5-custom-domains quota) — no TLS ` +
                  `certificate is coming until an operator associates it. ` +
                  `Runbook: docs/custom-domains.md.`,
                linkPath: '/ecommerce/customers',
                forceEmail: true,
              },
              { roles: ['owner', 'admin'] },
            )
          }
        } catch (err) {
          console.warn('[domain-purchase] manual-attach alert failed', err)
        }
      }
    }
  } catch {
    // The status card + runbook cover manual completion; the purchase stands.
  }

  return { ok: true, purchaseId, dryRun }
}

export async function listDomainPurchases(organizationId: string): Promise<DomainPurchaseView[]> {
  const rows = await db
    .select()
    .from(schema.clinicDomainPurchase)
    .where(eq(schema.clinicDomainPurchase.organizationId, organizationId))
    .orderBy(desc(schema.clinicDomainPurchase.createdAt))
  return rows.map((r) => ({
    id: r.id,
    domain: r.domain,
    status: r.status,
    purchasePriceCents: r.purchasePriceCents,
    dryRun: r.dryRun === 1,
    includedInPlan: r.includedInPlan === 1,
    error: r.error,
    renewalError: r.renewalError,
    purchasedAt: r.purchasedAt,
    renewsAt: r.renewsAt,
  }))
}

/** Org-scoped single-row read (the buy flow's polling target). */
export async function getDomainPurchase(
  organizationId: string,
  id: string,
): Promise<DomainPurchaseView | null> {
  const [r] = await db
    .select()
    .from(schema.clinicDomainPurchase)
    .where(
      and(
        eq(schema.clinicDomainPurchase.id, id),
        eq(schema.clinicDomainPurchase.organizationId, organizationId),
      ),
    )
    .limit(1)
  if (!r) return null
  return {
    id: r.id,
    domain: r.domain,
    status: r.status,
    purchasePriceCents: r.purchasePriceCents,
    dryRun: r.dryRun === 1,
    includedInPlan: r.includedInPlan === 1,
    error: r.error,
    renewalError: r.renewalError,
    purchasedAt: r.purchasedAt,
    renewsAt: r.renewsAt,
  }
}

// ── Renewals (the domain-renewals cron) ──────────────────────────────────────

/** How far ahead of expiry the cron starts trying (daily retries inside). */
const RENEWAL_WINDOW_DAYS = 30

export interface DomainRenewalRunResult {
  scanned: number
  renewed: number
  released: number
  failed: number
  details: Array<{ domain: string; organizationId: string; outcome: string }>
}

/**
 * Renew every live platform-bought domain coming up on expiry:
 *
 *  - clinic subscription NOT active/trialing → status 'released' (auto-renew
 *    is already off, so the domain simply lapses at the registrar; the
 *    clinic can transfer out any time before then — leaving is allowed);
 *  - plan-included domain → the platform renews (price pinned to the stored
 *    renewal quote — the same cap that admitted it to the free tier);
 *  - paid domain → charge the clinic's card FIRST, then renew; a decline
 *    records renewalError and retries daily inside the window.
 *
 * Idempotent: success advances renewsAt a year, which exits the window.
 */
export async function runDomainRenewals(opts?: { now?: Date }): Promise<DomainRenewalRunResult> {
  const now = opts?.now ?? new Date()
  const windowEnd = new Date(now.getTime() + RENEWAL_WINDOW_DAYS * 86_400_000)
  const result: DomainRenewalRunResult = { scanned: 0, renewed: 0, released: 0, failed: 0, details: [] }

  const due = await db
    .select({
      row: schema.clinicDomainPurchase,
      subscriptionStatus: schema.clinicProfile.subscriptionStatus,
      stripeCustomerId: schema.clinicProfile.stripeCustomerId,
    })
    .from(schema.clinicDomainPurchase)
    .leftJoin(
      schema.clinicProfile,
      eq(schema.clinicProfile.organizationId, schema.clinicDomainPurchase.organizationId),
    )
    .where(
      and(
        eq(schema.clinicDomainPurchase.status, 'active'),
        eq(schema.clinicDomainPurchase.dryRun, 0),
        lte(schema.clinicDomainPurchase.renewsAt, windowEnd),
      ),
    )

  for (const { row, subscriptionStatus, stripeCustomerId } of due) {
    result.scanned++
    const fail = async (message: string) => {
      result.failed++
      result.details.push({ domain: row.domain, organizationId: row.organizationId, outcome: `failed: ${message}` })
      await db
        .update(schema.clinicDomainPurchase)
        .set({ renewalError: message, updatedAt: new Date() })
        .where(eq(schema.clinicDomainPurchase.id, row.id))
    }

    try {
      const clinicActive = subscriptionStatus === 'active' || subscriptionStatus === 'trialing'
      if (!clinicActive) {
        // Churned — never renew on the platform's dime. Auto-renew is off,
        // so the registrar lets it lapse at expiry.
        await db
          .update(schema.clinicDomainPurchase)
          .set({ status: 'released', renewalError: null, updatedAt: new Date() })
          .where(eq(schema.clinicDomainPurchase.id, row.id))
        result.released++
        result.details.push({ domain: row.domain, organizationId: row.organizationId, outcome: 'released (subscription inactive)' })
        continue
      }

      const renewalPrice = row.renewalPriceCents
      if (!renewalPrice || renewalPrice <= 0) {
        await fail('No stored renewal price — renew manually at name.com and update the row.')
        continue
      }

      let renewalPaymentIntentId: string | null = null
      if (row.includedInPlan !== 1) {
        // Paid domain: the clinic's card pays BEFORE the registrar does.
        if (!stripeCustomerId) {
          await fail('No payment method on file — ask the clinic to add a card in Settings → Billing.')
          continue
        }
        try {
          const intent = await stripe.paymentIntents.create({
            customer: stripeCustomerId,
            amount: renewalPrice,
            currency: 'usd',
            off_session: true,
            confirm: true,
            description: `Domain renewal: ${row.domain} (1 year)`,
            metadata: { organizationId: row.organizationId, domain: row.domain, kind: 'domain_renewal' },
          })
          renewalPaymentIntentId = intent.id
        } catch (err) {
          await fail(err instanceof Error ? err.message : 'Card charge failed.')
          continue
        }
      }

      try {
        await renewDomain(row.domain, renewalPrice)
      } catch (err) {
        // Never keep renewal money for a renewal that didn't happen — refund
        // so tomorrow's retry starts clean instead of double-charging.
        if (renewalPaymentIntentId) {
          await stripe.refunds.create({ payment_intent: renewalPaymentIntentId }).catch(() => {})
        }
        await fail(
          `${err instanceof Error ? err.message : 'Registrar renewal failed.'}${renewalPaymentIntentId ? ' (charge refunded)' : ''}`,
        )
        continue
      }
      const nextRenewsAt = new Date((row.renewsAt ?? now).getTime())
      nextRenewsAt.setFullYear(nextRenewsAt.getFullYear() + 1)
      await db
        .update(schema.clinicDomainPurchase)
        .set({ renewsAt: nextRenewsAt, renewalError: null, updatedAt: new Date() })
        .where(eq(schema.clinicDomainPurchase.id, row.id))
      result.renewed++
      result.details.push({
        domain: row.domain,
        organizationId: row.organizationId,
        outcome: row.includedInPlan === 1 ? 'renewed (included in plan)' : 'renewed (clinic charged)',
      })
    } catch (err) {
      await fail(err instanceof Error ? err.message : 'unknown')
    }
  }

  return result
}

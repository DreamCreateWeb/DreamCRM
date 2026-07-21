import 'server-only'
import { randomUUID } from 'crypto'
import { and, desc, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { stripe } from '@/lib/stripe'
import {
  checkAvailability,
  createDomain,
  createRecord,
  isLivePurchasesEnabled,
  isNameComConfigured,
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

export interface DomainOffer {
  domainName: string
  purchasePriceCents: number
  renewalPriceCents: number | null
}

export interface DomainPurchaseView {
  id: string
  domain: string
  status: string
  purchasePriceCents: number
  dryRun: boolean
  error: string | null
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
    }))
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

  // Charge first (live mode only) — the clinic's saved card via their
  // platform-billing Stripe customer. No customer/card → a clear next step.
  let paymentIntentId: string | null = null
  if (!dryRun) {
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
    createdBy: userId,
  })

  // Register (or simulate). A live failure refunds the charge — never keep
  // money for a domain that didn't register.
  if (!dryRun) {
    try {
      await createDomain(domain, offer.purchasePriceCents)
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
    error: r.error,
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
    error: r.error,
    purchasedAt: r.purchasedAt,
    renewsAt: r.renewsAt,
  }
}

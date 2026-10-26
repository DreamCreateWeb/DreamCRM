import type { Tone } from '@/lib/ui/encodings'

/**
 * Map a raw Stripe subscription status → a design-system semantic tone + a
 * plain-language label + a one-line description. Client-safe (no DB / Stripe
 * imports) so it's shared by the Plans panel, Settings → Billing, and the
 * dunning banner — one source of truth so copy + color can't drift.
 *
 * Tones follow DESIGN-SYSTEM.md: ok=emerald · info=sky=ball-theirs ·
 * warn=amber=needs-OUR-action · urgent=rose=problem-now · neutral=gray=inert.
 */
export interface BillingStatusMeta {
  /** null when there's nothing worth showing a pill for (no subscription). */
  label: string | null
  tone: Tone
  description: string
  severity: 'ok' | 'info' | 'warn' | 'urgent' | 'neutral'
}

/**
 * Statuses that mean "payment is broken — we keep access but the clinic must
 * fix their card." Drives the persistent dunning banner.
 */
export const DUNNING_STATUSES = ['past_due', 'unpaid', 'incomplete_expired'] as const

export function isDunningStatus(status: string | null | undefined): boolean {
  return Boolean(status) && (DUNNING_STATUSES as readonly string[]).includes(status as string)
}

export function subscriptionStatusMeta(status: string | null | undefined): BillingStatusMeta {
  switch (status) {
    case 'active':
      return { label: 'Active', tone: 'ok', severity: 'ok', description: 'Your subscription is active.' }
    case 'trialing':
      return { label: 'Trial', tone: 'info', severity: 'info', description: "You're on a free trial." }
    case 'past_due':
      return {
        label: 'Past due',
        tone: 'warn',
        severity: 'warn',
        description: "Your last payment didn't go through.",
      }
    case 'unpaid':
      return {
        label: 'Unpaid',
        tone: 'urgent',
        severity: 'urgent',
        description: 'Your subscription is unpaid and at risk of cancellation.',
      }
    case 'incomplete':
      return {
        label: 'Incomplete',
        tone: 'warn',
        severity: 'warn',
        description: "Your first payment hasn't completed yet.",
      }
    case 'incomplete_expired':
      return {
        label: 'Payment expired',
        tone: 'urgent',
        severity: 'urgent',
        description: 'Your initial payment expired before it completed.',
      }
    case 'canceled':
      return { label: 'Canceled', tone: 'neutral', severity: 'neutral', description: 'Your subscription is canceled.' }
    case 'paused':
      return { label: 'Paused', tone: 'neutral', severity: 'neutral', description: 'Your subscription is paused.' }
    default:
      // No subscription on file (null), or an unrecognized status — show nothing.
      return { label: null, tone: 'neutral', severity: 'neutral', description: 'No active subscription.' }
  }
}

/** The Connected-accounts page's Stripe row for a CLINIC — the same union
 *  `IntegrationsPanel` renders (a client-safe mirror; no import cycle). */
export interface ClinicStripeRow {
  status:
    | { kind: 'connected'; detail?: string }
    | { kind: 'available'; detail?: string }
    | { kind: 'partial'; detail?: string; managed?: boolean }
    | { kind: 'misconfigured'; detail?: string; managed?: boolean }
  description: string
  /** Where "Connect" goes when there is nothing to manage yet. */
  connectHref?: string
}

/**
 * Settings → Connected accounts, the clinic's Stripe row, READ from the
 * billing columns rather than asserted. It used to print "Connected ·
 * Subscription managed by Stripe" for every clinic — a no-card trial has no
 * subscription for seven days and a managed/comped clinic never will, and
 * both read a green pill about a subscription that did not exist (a status
 * that cannot be false is a dishonest status).
 */
export function clinicStripeRowStatus(input: {
  stripeSubscriptionId: string | null
  subscriptionStatus: string | null
  billingMode: string | null
  onTrial: boolean
}): ClinicStripeRow {
  const managed = input.billingMode === 'managed' || input.billingMode === 'comped'
  if (!input.stripeSubscriptionId) {
    if (managed) {
      return {
        status: { kind: 'connected', detail: 'Billed by Dream Create' },
        description: 'Your plan is billed by Dream Create directly — nothing to manage in Stripe.',
      }
    }
    return {
      status: {
        kind: 'available',
        detail: input.onTrial ? 'Free trial — no card on file yet' : 'No subscription on file yet',
      },
      description: 'Set up billing when you are ready — Stripe handles the card, the receipts and the invoices.',
      connectHref: '/settings/billing',
    }
  }
  const meta = subscriptionStatusMeta(input.subscriptionStatus)
  const detail = meta.label ?? 'Subscription on file'
  if (meta.severity === 'warn' || meta.severity === 'urgent') {
    return {
      status: { kind: 'partial', detail: `${detail} — ${meta.description}` },
      description: 'Your subscription needs a look. Use the Stripe customer portal to update the card on file.',
    }
  }
  return {
    status: { kind: 'connected', detail },
    description:
      'Your subscription is managed through Stripe. Use the Stripe customer portal to change card, update billing address, or download invoices.',
  }
}

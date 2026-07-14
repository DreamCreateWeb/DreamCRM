import 'server-only'
import { randomBytes } from 'crypto'
import { and, desc, eq, gte, isNotNull, ne } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/utils'
import { authEmailShell, deliver } from '@/lib/email'
import { getClinicSenderIdentity } from '@/lib/services/clinic-sender'
import { renderAutomatedEmail } from '@/lib/services/email-automations'
import { canTakeBalancePayments, createBalancePaymentSession, finalizeBalancePaymentFromSession } from '@/lib/services/balance-payments'
import { queueCommLogWriteBack } from '@/lib/services/pms'
import {
  resolveBalanceOutreachSettings,
  BALANCE_OUTREACH_WINDOW_DAYS,
  type BalanceOutreachSettings,
} from '@/lib/types/balance-outreach'

/**
 * Billing outreach — "email-to-pay". Staff (or the opt-in automated cadence)
 * email a patient their balance with a secure pay link to the PUBLIC
 * /b/[token] landing (token IS the auth; the /r /w /c pattern) — no portal
 * sign-in between a willing payer and their payment. The landing always shows
 * the LIVE PMS balance and the money itself rides the existing
 * patient_balance_payment rails (Connect direct charge, idempotent finalize,
 * /payments/online reconciliation). The PMS keeps owning the ledger.
 */

const DAY_MS = 24 * 60 * 60 * 1000

function fmtDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

// ── Settings CRUD (Shop → Payments card) ─────────────────────────────────────

export async function getBalanceOutreachSettings(organizationId: string): Promise<BalanceOutreachSettings> {
  const [row] = await db
    .select({ balanceOutreach: schema.clinicProfile.balanceOutreach })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .limit(1)
  return resolveBalanceOutreachSettings(row?.balanceOutreach ?? null)
}

export async function updateBalanceOutreachSettings(
  organizationId: string,
  settings: BalanceOutreachSettings,
): Promise<BalanceOutreachSettings> {
  const cleaned = resolveBalanceOutreachSettings(settings)
  await db
    .update(schema.clinicProfile)
    .set({ balanceOutreach: cleaned, updatedAt: new Date() })
    .where(eq(schema.clinicProfile.organizationId, organizationId))
  return cleaned
}

// ── Sending the pay-link email ───────────────────────────────────────────────

const APP_BASE =
  process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '') || 'https://www.dreamcreatestudio.com'

export type PayLinkSendResult =
  | { ok: true; requestId: string }
  | { ok: false; reason: 'no_balance' | 'no_email' | 'payments_unavailable' | 'recently_sent' | 'error'; error?: string }

/**
 * Email one patient their balance + pay link. Guards: positive PMS balance,
 * email on file, clinic's Connect can charge, and no pay-link email within
 * the last 3 days (staff double-clicks and the cadence must never stack).
 * `sentByUserId` null = the automated cadence.
 */
export async function sendPayLinkEmail(
  organizationId: string,
  patientId: string,
  sentByUserId: string | null,
  opts?: { source?: 'staff' | 'auto' },
): Promise<PayLinkSendResult> {
  try {
    const [p] = await db
      .select({
        id: schema.patient.id,
        firstName: schema.patient.firstName,
        lastName: schema.patient.lastName,
        email: schema.patient.email,
        balance: schema.patient.pmsBalanceCents,
        isActive: schema.patient.isActive,
      })
      .from(schema.patient)
      .where(and(eq(schema.patient.organizationId, organizationId), eq(schema.patient.id, patientId)))
      .limit(1)
    if (!p || !p.balance || p.balance <= 0 || p.isActive !== 1) return { ok: false, reason: 'no_balance' }
    if (!p.email) return { ok: false, reason: 'no_email' }
    if (!(await canTakeBalancePayments(organizationId))) return { ok: false, reason: 'payments_unavailable' }

    // Never stack pay-link emails — one per patient per 3 days, whatever the
    // source (a staff send suppresses the cadence and vice versa).
    const [recent] = await db
      .select({ id: schema.balancePaymentRequest.id })
      .from(schema.balancePaymentRequest)
      .where(
        and(
          eq(schema.balancePaymentRequest.organizationId, organizationId),
          eq(schema.balancePaymentRequest.patientId, patientId),
          gte(schema.balancePaymentRequest.sentAt, new Date(Date.now() - 3 * DAY_MS)),
        ),
      )
      .limit(1)
    if (recent) return { ok: false, reason: 'recently_sent' }

    const token = `pb_${randomBytes(18).toString('base64url')}`
    const requestId = newId('bpr')
    await db.insert(schema.balancePaymentRequest).values({
      id: requestId,
      organizationId,
      patientId,
      token,
      balanceCentsAtSend: p.balance,
      status: 'sent',
      source: opts?.source ?? (sentByUserId ? 'staff' : 'auto'),
      sentByUserId,
    })

    const sender = await getClinicSenderIdentity(organizationId)
    const rendered = await renderAutomatedEmail(organizationId, 'balance_pay_link', {
      firstName: p.firstName,
      clinicName: sender.name,
      clinicPhone: '',
      balance: fmtDollars(p.balance),
    })
    await deliver({
      to: p.email,
      from: sender.from,
      replyTo: sender.replyTo,
      gmail: sender.gmail,
      subject: rendered.full.subject,
      html: authEmailShell({
        heading: 'Your balance, handled in a minute',
        introHtml: rendered.full.body
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/\n/g, '<br>'),
        buttonUrl: `${APP_BASE}/b/${token}`,
        buttonLabel: 'Pay my balance',
        footnoteHtml:
          'The payment page is secure and takes about a minute — no account or sign-in needed. Question about the amount? Just reply to this email.',
      }),
    })
    queueCommLogWriteBack(organizationId, patientId, {
      note: `Balance email sent (${fmtDollars(p.balance)} with a secure pay link).`,
      mode: 'Email',
    }).catch(() => {})
    return { ok: true, requestId }
  } catch (err) {
    console.warn('[balance-outreach] send failed', err)
    return { ok: false, reason: 'error', error: err instanceof Error ? err.message : 'unknown' }
  }
}

/** Bulk "email pay link" from the patients list. Sequential, per-patient
 *  error isolation — mirrors sendBulkPatientEmail's loop pattern. */
export async function sendPayLinksBulk(
  organizationId: string,
  patientIds: string[],
  sentByUserId: string,
): Promise<{ sent: number; skipped: number; failed: number }> {
  const out = { sent: 0, skipped: 0, failed: 0 }
  for (const pid of patientIds.slice(0, 500)) {
    const r = await sendPayLinkEmail(organizationId, pid, sentByUserId, { source: 'staff' })
    if (r.ok) out.sent++
    else if (r.reason === 'error') out.failed++
    else out.skipped++
  }
  return out
}

// ── The automated cadence (daily, riding the retention-automations cron) ─────

export interface BalanceCadenceResult {
  orgsScanned: number
  candidates: number
  sent: number
  skipped: number
}

/**
 * Opt-in automated balance reminders. For every clinic with the cadence ON:
 * active patients owing ≥ minBalanceCents with an email get the pay-link
 * email — at most one per cadenceDays, and at most maxSends automated sends
 * per rolling 90 days (after that, collections is a phone call). Demo orgs
 * never send. sendPayLinkEmail's own guards (recent send, Connect active)
 * still apply.
 */
export async function runBalanceReminderCadence(opts?: { now?: Date }): Promise<BalanceCadenceResult> {
  const now = opts?.now ?? new Date()
  const result: BalanceCadenceResult = { orgsScanned: 0, candidates: 0, sent: 0, skipped: 0 }

  const profiles = await db
    .select({
      organizationId: schema.clinicProfile.organizationId,
      balanceOutreach: schema.clinicProfile.balanceOutreach,
    })
    .from(schema.clinicProfile)

  for (const profile of profiles) {
    const settings = resolveBalanceOutreachSettings(profile.balanceOutreach)
    if (!settings.enabled) continue

    // Demo orgs: never email (personas aren't real inboxes).
    const [org] = await db
      .select({ isDemo: schema.organization.isDemo })
      .from(schema.organization)
      .where(eq(schema.organization.id, profile.organizationId))
      .limit(1)
    if (org?.isDemo) continue
    result.orgsScanned++

    const patients = await db
      .select({ id: schema.patient.id })
      .from(schema.patient)
      .where(
        and(
          eq(schema.patient.organizationId, profile.organizationId),
          eq(schema.patient.isActive, 1),
          gte(schema.patient.pmsBalanceCents, settings.minBalanceCents),
          isNotNull(schema.patient.email),
          ne(schema.patient.email, ''),
        ),
      )
      .limit(500)

    for (const p of patients) {
      result.candidates++

      // Cadence + cap: look at this patient's request history.
      const history = await db
        .select({ sentAt: schema.balancePaymentRequest.sentAt, source: schema.balancePaymentRequest.source })
        .from(schema.balancePaymentRequest)
        .where(
          and(
            eq(schema.balancePaymentRequest.organizationId, profile.organizationId),
            eq(schema.balancePaymentRequest.patientId, p.id),
            gte(
              schema.balancePaymentRequest.sentAt,
              new Date(now.getTime() - BALANCE_OUTREACH_WINDOW_DAYS * DAY_MS),
            ),
          ),
        )
        .orderBy(desc(schema.balancePaymentRequest.sentAt))
      const lastSent = history[0]?.sentAt as Date | undefined
      const autoCount = history.filter((h) => h.source === 'auto').length
      if (lastSent && now.getTime() - lastSent.getTime() < settings.cadenceDays * DAY_MS) {
        result.skipped++
        continue
      }
      if (autoCount >= settings.maxSends) {
        result.skipped++
        continue
      }

      const r = await sendPayLinkEmail(profile.organizationId, p.id, null, { source: 'auto' })
      if (r.ok) result.sent++
      else result.skipped++
    }
  }
  return result
}

// ── The public /b/[token] landing ────────────────────────────────────────────

export interface PayLandingContext {
  /** 'due' = show the pay form; 'clear' = balance is zero/negative now. */
  state: 'due' | 'clear'
  organizationId: string
  patientId: string
  clinicName: string
  brandColor: string | null
  logoUrl: string | null
  clinicPhone: string | null
  slug: string | null
  patientFirstName: string
  /** LIVE balance right now (never the emailed snapshot). */
  balanceCents: number
  /** When the PMS last refreshed the number ("as of"). */
  balanceUpdatedAt: Date | null
  /** Connect can actually charge — when false the page says "call us". */
  canPay: boolean
}

/** Load the pay landing's context. Null = unknown token (404). */
export async function getPayLandingByToken(token: string): Promise<PayLandingContext | null> {
  const [req] = await db
    .select({
      organizationId: schema.balancePaymentRequest.organizationId,
      patientId: schema.balancePaymentRequest.patientId,
      firstName: schema.patient.firstName,
      email: schema.patient.email,
      balance: schema.patient.pmsBalanceCents,
      balanceUpdatedAt: schema.patient.pmsBalanceUpdatedAt,
    })
    .from(schema.balancePaymentRequest)
    .innerJoin(schema.patient, eq(schema.patient.id, schema.balancePaymentRequest.patientId))
    .where(eq(schema.balancePaymentRequest.token, token))
    .limit(1)
  if (!req) return null

  const [profile] = await db
    .select({
      displayName: schema.clinicProfile.displayName,
      brandColor: schema.clinicProfile.brandColor,
      logoUrl: schema.clinicProfile.logoUrl,
      phone: schema.clinicProfile.phone,
    })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, req.organizationId))
    .limit(1)
  const [org] = await db
    .select({ slug: schema.organization.slug, name: schema.organization.name })
    .from(schema.organization)
    .where(eq(schema.organization.id, req.organizationId))
    .limit(1)

  const balance = req.balance ?? 0
  return {
    state: balance > 0 ? 'due' : 'clear',
    organizationId: req.organizationId,
    patientId: req.patientId,
    clinicName: profile?.displayName || org?.name || 'Your clinic',
    brandColor: profile?.brandColor ?? null,
    logoUrl: profile?.logoUrl ?? null,
    clinicPhone: profile?.phone ?? null,
    slug: org?.slug ?? null,
    patientFirstName: req.firstName,
    balanceCents: balance,
    balanceUpdatedAt: (req.balanceUpdatedAt as Date | null) ?? null,
    canPay: await canTakeBalancePayments(req.organizationId),
  }
}

/** Start a Stripe Checkout for the landing (token-is-auth). Returns the
 *  redirect URL, or a friendly error. */
export async function createCheckoutForPayToken(
  token: string,
  amountCents: number,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const ctx = await getPayLandingByToken(token)
  if (!ctx) return { ok: false, error: 'This link isn’t valid anymore.' }
  if (ctx.state !== 'due') return { ok: false, error: 'Good news — your balance is already settled.' }
  const [p] = await db
    .select({ email: schema.patient.email })
    .from(schema.patient)
    .where(eq(schema.patient.id, ctx.patientId))
    .limit(1)
  try {
    const { url } = await createBalancePaymentSession({
      organizationId: ctx.organizationId,
      patientId: ctx.patientId,
      amountCents,
      patientEmail: p?.email ?? null,
      clinicName: ctx.clinicName,
      baseUrl: APP_BASE,
      returnUrl: `${APP_BASE}/b/${token}`,
    })
    return { ok: true, url }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not start the payment.' }
  }
}

/** Finalize the return trip (idempotent; the Connect webhook is the backstop)
 *  and stamp the request paid. Returns the paid amount for the receipt. */
export async function finalizePayTokenReturn(
  token: string,
  sessionId: string,
): Promise<{ paidCents: number } | null> {
  const [req] = await db
    .select()
    .from(schema.balancePaymentRequest)
    .where(eq(schema.balancePaymentRequest.token, token))
    .limit(1)
  if (!req) return null
  await finalizeBalancePaymentFromSession(req.organizationId, sessionId)
  const [payment] = await db
    .select({ id: schema.patientBalancePayment.id, amountCents: schema.patientBalancePayment.amountCents, status: schema.patientBalancePayment.status })
    .from(schema.patientBalancePayment)
    .where(
      and(
        eq(schema.patientBalancePayment.organizationId, req.organizationId),
        eq(schema.patientBalancePayment.stripeCheckoutSessionId, sessionId),
      ),
    )
    .limit(1)
  if (!payment || payment.status !== 'paid') return null
  if (req.status !== 'paid') {
    await db
      .update(schema.balancePaymentRequest)
      .set({ status: 'paid', paidAt: new Date(), paymentId: payment.id, updatedAt: new Date() })
      .where(eq(schema.balancePaymentRequest.id, req.id))
  }
  return { paidCents: payment.amountCents }
}

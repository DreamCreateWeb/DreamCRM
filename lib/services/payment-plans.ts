import 'server-only'
import { randomBytes } from 'crypto'
import { and, desc, eq, inArray, isNotNull, lte, ne } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { stripe } from '@/lib/stripe'
import { authEmailShell, deliver, sendNotificationEmail } from '@/lib/email'
import { getClinicSenderIdentity } from '@/lib/services/clinic-sender'
import { canTakeBalancePayments } from '@/lib/services/balance-payments'
import { queueCommLogWriteBack } from '@/lib/services/pms/sync'
import { notifyOrgMembers } from '@/lib/services/notifications'
import { newId } from '@/lib/utils'
import { platformFeeCents } from '@/lib/types/shop'

/**
 * Payment plans with card-on-file autopay (Dental Intelligence parity, on our
 * Connect rails): a balance split into N monthly installments charged
 * automatically. Staff PROPOSE (amount + months) → the patient ACCEPTS at
 * /i/[token] via a Stripe Checkout SETUP session on the clinic's connected
 * account (saves the card, charges nothing) → the FIRST installment charges
 * off-session the moment setup finalizes, the rest via the daily cron.
 *
 * Money truth: every successful charge records a patient_balance_payment row
 * — the same reconciliation list /payments/online and the Collections board
 * already read. The PMS ledger still rules; pms_balance_cents is never
 * touched here. Declines mark the plan past_due and retry every 3 days, up
 * to 3 attempts, then park it for staff follow-up (never infinite retries
 * against a dead card).
 */

export const PLAN_MIN_MONTHS = 2
export const PLAN_MAX_MONTHS = 12
export const PLAN_MIN_TOTAL_CENTS = 10_000 // $100 — below this, one payment is kinder.
export const PLAN_MIN_INSTALLMENT_CENTS = 2_500 // $25 floor per charge (fees stay sane).
const RETRY_DAYS = 3
const MAX_FAILED_ATTEMPTS = 3
const DAY_MS = 24 * 60 * 60 * 1000

const APP_BASE =
  process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '') || 'https://www.dreamcreatestudio.com'

/** Even split, floor per installment; the LAST installment takes the
 *  remainder so the sum is exactly the total. */
export function planInstallmentCents(totalCents: number, installments: number): number {
  return Math.floor(totalCents / installments)
}
export function planAmountForInstallment(
  totalCents: number,
  installments: number,
  index: number, // 0-based
): number {
  const base = planInstallmentCents(totalCents, installments)
  return index === installments - 1 ? totalCents - base * (installments - 1) : base
}

/** One month later. setUTCMonth overflow (Jan 31 → Mar ~2) is accepted — the
 *  drift is cosmetic and self-corrects at 12 charges/year max. */
function addOneMonth(from: Date): Date {
  const d = new Date(from)
  d.setUTCMonth(d.getUTCMonth() + 1)
  return d
}

async function connectedAccount(organizationId: string) {
  const [row] = await db
    .select({
      accountId: schema.shopConfig.stripeAccountId,
      status: schema.shopConfig.stripeAccountStatus,
      charges: schema.shopConfig.chargesEnabled,
      currency: schema.shopConfig.currency,
      platformFeeBps: schema.shopConfig.platformFeeBps,
    })
    .from(schema.shopConfig)
    .where(eq(schema.shopConfig.organizationId, organizationId))
    .limit(1)
  return row ?? null
}

function fmtDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── Propose ──────────────────────────────────────────────────────────────────

export type ProposePlanResult =
  | { ok: true; planId: string }
  | { ok: false; error: string }

export async function proposePaymentPlan(
  organizationId: string,
  patientId: string,
  input: { totalCents: number; installments: number },
  proposedByUserId: string,
): Promise<ProposePlanResult> {
  const installments = Math.round(input.installments)
  const totalCents = Math.round(input.totalCents)
  if (!Number.isFinite(totalCents) || totalCents < PLAN_MIN_TOTAL_CENTS) {
    return { ok: false, error: `Payment plans start at ${fmtDollars(PLAN_MIN_TOTAL_CENTS)} — below that, a single pay link is kinder.` }
  }
  if (installments < PLAN_MIN_MONTHS || installments > PLAN_MAX_MONTHS) {
    return { ok: false, error: `Pick between ${PLAN_MIN_MONTHS} and ${PLAN_MAX_MONTHS} monthly payments.` }
  }
  const per = planInstallmentCents(totalCents, installments)
  if (per < PLAN_MIN_INSTALLMENT_CENTS) {
    return { ok: false, error: `That works out to ${fmtDollars(per)} a month — keep each payment at least ${fmtDollars(PLAN_MIN_INSTALLMENT_CENTS)} (fewer months).` }
  }

  const [p] = await db
    .select({
      firstName: schema.patient.firstName,
      email: schema.patient.email,
      balance: schema.patient.pmsBalanceCents,
      isActive: schema.patient.isActive,
    })
    .from(schema.patient)
    .where(and(eq(schema.patient.organizationId, organizationId), eq(schema.patient.id, patientId)))
    .limit(1)
  if (!p || p.isActive !== 1) return { ok: false, error: 'Patient not found.' }
  if (!p.email) return { ok: false, error: 'This patient has no email on file — a plan needs one for the acceptance link.' }
  if (!p.balance || p.balance <= 0) return { ok: false, error: 'This patient has no balance on file.' }
  if (totalCents > p.balance) return { ok: false, error: 'The plan can’t exceed the current balance.' }
  if (!(await canTakeBalancePayments(organizationId))) {
    return { ok: false, error: 'Connect your Stripe account first (Integrations) so the card can be charged.' }
  }

  // One open plan per patient — a second concurrent plan is a bookkeeping trap.
  const [openPlan] = await db
    .select({ id: schema.paymentPlan.id })
    .from(schema.paymentPlan)
    .where(
      and(
        eq(schema.paymentPlan.organizationId, organizationId),
        eq(schema.paymentPlan.patientId, patientId),
        inArray(schema.paymentPlan.status, ['proposed', 'active', 'past_due']),
      ),
    )
    .limit(1)
  if (openPlan) return { ok: false, error: 'This patient already has an open payment plan — cancel it first to start over.' }

  const planId = newId('ppl')
  const token = `pl_${randomBytes(18).toString('base64url')}`
  await db.insert(schema.paymentPlan).values({
    id: planId,
    organizationId,
    patientId,
    token,
    totalCents,
    installmentCents: per,
    installments,
    status: 'proposed',
    proposedByUserId,
  })

  // The proposal email — accepting happens on the public /i/[token] page.
  try {
    const sender = await getClinicSenderIdentity(organizationId)
    const last = planAmountForInstallment(totalCents, installments, installments - 1)
    const perLine =
      last === per
        ? `${installments} monthly payments of ${fmtDollars(per)}`
        : `${installments} monthly payments (${fmtDollars(per)}/month, last one ${fmtDollars(last)})`
    await deliver({
      to: p.email,
      from: sender.from,
      replyTo: sender.replyTo,
      gmail: sender.gmail,
      subject: `A payment plan for your balance — ${sender.name}`,
      html: authEmailShell({
        heading: 'Spread it out, no stress',
        introHtml: `Hi ${escapeHtml(p.firstName)},<br><br>We set up a payment plan option for your ${fmtDollars(totalCents)} balance at ${escapeHtml(sender.name)}: <strong>${perLine}</strong>, charged automatically to a card you save. The first payment happens when you accept — nothing is charged until then.`,
        buttonUrl: `${APP_BASE}/i/${token}`,
        buttonLabel: 'Review my payment plan',
        footnoteHtml:
          'The setup page is secure and takes about two minutes. Rather handle it differently? Just reply to this email — we’ll figure it out together.',
      }),
    })
  } catch (err) {
    // The plan exists; the email is retryable by re-proposing after cancel.
    console.warn('[payment-plans] proposal email failed', err)
  }

  queueCommLogWriteBack(organizationId, patientId, {
    note: `Payment plan proposed: ${fmtDollars(totalCents)} over ${installments} monthly payments.`,
    mode: 'Email',
  }).catch(() => {})

  return { ok: true, planId }
}

// ── The public /i/[token] landing ────────────────────────────────────────────

export interface PlanLandingContext {
  state: 'proposed' | 'active' | 'past_due' | 'completed' | 'canceled'
  organizationId: string
  clinicName: string
  brandColor: string | null
  logoUrl: string | null
  clinicPhone: string | null
  patientFirstName: string
  totalCents: number
  installments: number
  installmentCents: number
  lastInstallmentCents: number
  installmentsPaid: number
  nextChargeAt: Date | null
  /** Connect can actually charge — when false the page says "call us". */
  canPay: boolean
}

export async function getPlanLandingByToken(token: string): Promise<PlanLandingContext | null> {
  const [plan] = await db
    .select({
      organizationId: schema.paymentPlan.organizationId,
      status: schema.paymentPlan.status,
      totalCents: schema.paymentPlan.totalCents,
      installments: schema.paymentPlan.installments,
      installmentCents: schema.paymentPlan.installmentCents,
      installmentsPaid: schema.paymentPlan.installmentsPaid,
      nextChargeAt: schema.paymentPlan.nextChargeAt,
      firstName: schema.patient.firstName,
    })
    .from(schema.paymentPlan)
    .innerJoin(schema.patient, eq(schema.patient.id, schema.paymentPlan.patientId))
    .where(eq(schema.paymentPlan.token, token))
    .limit(1)
  if (!plan) return null

  const [profile] = await db
    .select({
      displayName: schema.clinicProfile.displayName,
      brandColor: schema.clinicProfile.brandColor,
      logoUrl: schema.clinicProfile.logoUrl,
      phone: schema.clinicProfile.phone,
    })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, plan.organizationId))
    .limit(1)
  const [org] = await db
    .select({ name: schema.organization.name })
    .from(schema.organization)
    .where(eq(schema.organization.id, plan.organizationId))
    .limit(1)

  return {
    state: plan.status as PlanLandingContext['state'],
    organizationId: plan.organizationId,
    clinicName: profile?.displayName || org?.name || 'Your clinic',
    brandColor: profile?.brandColor ?? null,
    logoUrl: profile?.logoUrl ?? null,
    clinicPhone: profile?.phone ?? null,
    patientFirstName: plan.firstName,
    totalCents: plan.totalCents,
    installments: plan.installments,
    installmentCents: plan.installmentCents,
    lastInstallmentCents: planAmountForInstallment(plan.totalCents, plan.installments, plan.installments - 1),
    installmentsPaid: plan.installmentsPaid,
    nextChargeAt: plan.nextChargeAt,
    canPay: await canTakeBalancePayments(plan.organizationId),
  }
}

/** Start the card-saving Checkout (mode=setup — nothing charges here). */
export async function createPlanSetupCheckout(
  token: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const [plan] = await db
    .select()
    .from(schema.paymentPlan)
    .where(eq(schema.paymentPlan.token, token))
    .limit(1)
  if (!plan) return { ok: false, error: 'This link isn’t valid anymore.' }
  if (plan.status !== 'proposed') return { ok: false, error: 'This plan has already been set up.' }

  const cfg = await connectedAccount(plan.organizationId)
  if (!cfg?.accountId || cfg.status !== 'active' || cfg.charges !== 1) {
    return { ok: false, error: 'Online payment isn’t available right now — give the office a call and they’ll set it up over the phone.' }
  }

  try {
    const [p] = await db
      .select({ firstName: schema.patient.firstName, lastName: schema.patient.lastName, email: schema.patient.email })
      .from(schema.patient)
      .where(eq(schema.patient.id, plan.patientId))
      .limit(1)

    // Reuse the customer from a prior abandoned attempt instead of minting
    // duplicates on the clinic's account.
    let customerId = plan.stripeCustomerId
    if (!customerId) {
      const customer = await stripe.customers.create(
        {
          ...(p?.email ? { email: p.email } : {}),
          name: p ? `${p.firstName} ${p.lastName ?? ''}`.trim() : undefined,
          metadata: { kind: 'payment_plan', planId: plan.id, organizationId: plan.organizationId },
        },
        { stripeAccount: cfg.accountId },
      )
      customerId = customer.id
    }

    const session = await stripe.checkout.sessions.create(
      {
        mode: 'setup',
        customer: customerId,
        payment_method_types: ['card'],
        success_url: `${APP_BASE}/i/${token}?setup_session={CHECKOUT_SESSION_ID}`,
        cancel_url: `${APP_BASE}/i/${token}`,
        metadata: { kind: 'payment_plan', planId: plan.id, organizationId: plan.organizationId },
      } as never,
      { stripeAccount: cfg.accountId },
    )
    if (!session.url) return { ok: false, error: 'Stripe did not return a setup URL.' }

    await db
      .update(schema.paymentPlan)
      .set({ stripeCustomerId: customerId, stripeSetupSessionId: session.id, updatedAt: new Date() })
      .where(eq(schema.paymentPlan.id, plan.id))

    return { ok: true, url: session.url }
  } catch (err) {
    console.warn('[payment-plans] setup checkout failed', err)
    return { ok: false, error: 'Could not start the secure setup — please try again in a moment.' }
  }
}

/**
 * Finalize the setup return trip: attach the saved card, flip
 * proposed → active (CAS — safe against double-loads), and charge the FIRST
 * installment right away. Idempotent: an already-active plan returns ok.
 */
export async function finalizePlanSetup(
  token: string,
  sessionId: string,
): Promise<{ ok: true; firstChargeOk: boolean } | { ok: false; error: string }> {
  const [plan] = await db
    .select()
    .from(schema.paymentPlan)
    .where(eq(schema.paymentPlan.token, token))
    .limit(1)
  if (!plan) return { ok: false, error: 'This link isn’t valid anymore.' }
  if (plan.status !== 'proposed') return { ok: true, firstChargeOk: true }

  const cfg = await connectedAccount(plan.organizationId)
  if (!cfg?.accountId) return { ok: false, error: 'Payments aren’t configured.' }

  try {
    const session = await stripe.checkout.sessions.retrieve(
      sessionId,
      { expand: ['setup_intent'] } as never,
      { stripeAccount: cfg.accountId },
    )
    const si = session.setup_intent as { status?: string; payment_method?: string | { id: string } } | null
    const pm =
      si && typeof si.payment_method === 'object' && si.payment_method
        ? si.payment_method.id
        : (si?.payment_method as string | undefined)
    if (!si || si.status !== 'succeeded' || !pm) {
      return { ok: false, error: 'The card wasn’t saved — please try again.' }
    }

    // CAS proposed → active: only one return trip wins the flip.
    const claimed = await db
      .update(schema.paymentPlan)
      .set({
        status: 'active',
        stripePaymentMethodId: pm,
        acceptedAt: new Date(),
        nextChargeAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(schema.paymentPlan.id, plan.id), eq(schema.paymentPlan.status, 'proposed')))
      .returning({ id: schema.paymentPlan.id })
    if (claimed.length === 0) return { ok: true, firstChargeOk: true }

    // First installment, right now — the winner charges it inline so the
    // patient sees "1 of N paid" on the confirmation screen.
    const [fresh] = await db
      .select()
      .from(schema.paymentPlan)
      .where(eq(schema.paymentPlan.id, plan.id))
      .limit(1)
    const firstChargeOk = fresh ? await chargePlanInstallment(fresh, cfg) : false
    return { ok: true, firstChargeOk }
  } catch (err) {
    console.warn('[payment-plans] finalize failed', err)
    return { ok: false, error: 'Something went wrong finishing setup — the office can check on it.' }
  }
}

// ── Charging ─────────────────────────────────────────────────────────────────

/**
 * Charge one installment off-session. Success: records a
 * patient_balance_payment row, bumps the counter, schedules next month (or
 * completes the plan) and pings the front desk to post it to the PMS ledger.
 * Decline: past_due + a 3-day retry, parked after MAX_FAILED_ATTEMPTS.
 * Returns whether the charge succeeded. Never throws.
 */
async function chargePlanInstallment(
  plan: typeof schema.paymentPlan.$inferSelect,
  cfg: { accountId: string | null; currency: string | null; platformFeeBps?: number | null },
): Promise<boolean> {
  if (!cfg.accountId || !plan.stripeCustomerId || !plan.stripePaymentMethodId) return false
  const index = plan.installmentsPaid
  if (index >= plan.installments) return false
  const amount = planAmountForInstallment(plan.totalCents, plan.installments, index)

  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount,
        currency: cfg.currency || 'usd',
        customer: plan.stripeCustomerId,
        payment_method: plan.stripePaymentMethodId,
        off_session: true,
        confirm: true,
        // 1% platform fee — same rule on every Connect money path.
        ...(platformFeeCents(amount, cfg.platformFeeBps ?? 0) > 0
          ? { application_fee_amount: platformFeeCents(amount, cfg.platformFeeBps ?? 0) }
          : {}),
        description: `Payment plan installment ${index + 1} of ${plan.installments}`,
        metadata: { kind: 'payment_plan', planId: plan.id, organizationId: plan.organizationId },
      } as never,
      { stripeAccount: cfg.accountId },
    )

    const now = new Date()
    const paid = index + 1
    const done = paid >= plan.installments

    await db.insert(schema.patientBalancePayment).values({
      id: `bp_${randomBytes(10).toString('hex')}`,
      organizationId: plan.organizationId,
      patientId: plan.patientId,
      amountCents: amount,
      status: 'paid',
      paidAt: now,
      stripePaymentIntentId: intent.id,
      note: `Payment plan installment ${paid} of ${plan.installments}`,
    })

    await db
      .update(schema.paymentPlan)
      .set({
        installmentsPaid: paid,
        status: done ? 'completed' : 'active',
        failedAttempts: 0,
        lastError: null,
        nextChargeAt: done ? null : addOneMonth(plan.nextChargeAt ?? now),
        completedAt: done ? now : null,
        updatedAt: now,
      })
      .where(eq(schema.paymentPlan.id, plan.id))

    queueCommLogWriteBack(plan.organizationId, plan.patientId, {
      note: `Payment plan installment ${paid} of ${plan.installments} charged (${fmtDollars(amount)}).`,
      mode: 'Email',
    }).catch(() => {})
    await notifyPlanEvent(plan.organizationId, plan.patientId, {
      title: done
        ? `Payment plan completed — ${fmtDollars(plan.totalCents)} fully collected`
        : `Payment plan charge — ${fmtDollars(amount)} (${paid} of ${plan.installments})`,
      body: 'Post it to the PMS ledger when you get a chance.',
    })
    return true
  } catch (err) {
    const message = err instanceof Error ? err.message : 'charge failed'
    const attempts = plan.failedAttempts + 1
    const parked = attempts >= MAX_FAILED_ATTEMPTS
    await db
      .update(schema.paymentPlan)
      .set({
        status: 'past_due',
        failedAttempts: attempts,
        lastError: message.slice(0, 500),
        // Parked plans stop retrying — staff take it from here.
        nextChargeAt: parked ? null : new Date(Date.now() + RETRY_DAYS * DAY_MS),
        updatedAt: new Date(),
      })
      .where(eq(schema.paymentPlan.id, plan.id))
    await notifyPlanEvent(plan.organizationId, plan.patientId, {
      title: `Payment plan charge failed (attempt ${attempts} of ${MAX_FAILED_ATTEMPTS})`,
      body: parked
        ? 'We’ve stopped retrying — reach out to the patient for a new card.'
        : `We’ll retry automatically in ${RETRY_DAYS} days.`,
    })
    return false
  }
}

/** Best-effort staff ping (in-app owners/admins + the clinic inbox). */
async function notifyPlanEvent(
  organizationId: string,
  patientId: string,
  input: { title: string; body: string },
): Promise<void> {
  try {
    // The plan's patient never gets the staff alert about their own plan —
    // when their email doubles as a staff-hat user's (owner-as-patient /
    // demoing admin), the "reach out to the patient" ping must not reach them.
    const [pat] = await db
      .select({ email: schema.patient.email })
      .from(schema.patient)
      .where(eq(schema.patient.id, patientId))
      .limit(1)
    await notifyOrgMembers(
      organizationId,
      { bucket: 'comments', type: 'payment_plan', title: input.title, body: input.body, linkPath: '/payments/collections' },
      { roles: ['owner', 'admin'], excludeEmail: pat?.email ?? null },
    )
  } catch {
    /* best-effort */
  }
  try {
    const [profile] = await db
      .select({ email: schema.clinicProfile.email })
      .from(schema.clinicProfile)
      .where(eq(schema.clinicProfile.organizationId, organizationId))
      .limit(1)
    if (profile?.email) {
      await sendNotificationEmail({
        to: profile.email,
        name: null,
        title: input.title,
        body: input.body,
        linkPath: '/payments/collections',
      })
    }
  } catch {
    /* best-effort */
  }
}

export interface PlanChargeRunResult {
  scanned: number
  charged: number
  failed: number
  completed: number
}

/** The daily cron: charge every due installment across all clinics. Demo
 *  orgs never charge (their plans carry no Stripe ids anyway — belt AND
 *  suspenders). */
export async function runDuePlanCharges(opts?: { now?: Date }): Promise<PlanChargeRunResult> {
  const now = opts?.now ?? new Date()
  const result: PlanChargeRunResult = { scanned: 0, charged: 0, failed: 0, completed: 0 }

  const due = await db
    .select()
    .from(schema.paymentPlan)
    .where(
      and(
        inArray(schema.paymentPlan.status, ['active', 'past_due']),
        isNotNull(schema.paymentPlan.nextChargeAt),
        lte(schema.paymentPlan.nextChargeAt, now),
      ),
    )
    .limit(200)

  const cfgCache = new Map<string, Awaited<ReturnType<typeof connectedAccount>>>()
  const demoCache = new Map<string, boolean>()

  for (const plan of due) {
    result.scanned++

    let isDemo = demoCache.get(plan.organizationId)
    if (isDemo === undefined) {
      const [org] = await db
        .select({ isDemo: schema.organization.isDemo })
        .from(schema.organization)
        .where(eq(schema.organization.id, plan.organizationId))
        .limit(1)
      isDemo = Boolean(org?.isDemo)
      demoCache.set(plan.organizationId, isDemo)
    }
    if (isDemo || !plan.stripeCustomerId || !plan.stripePaymentMethodId) continue

    let cfg = cfgCache.get(plan.organizationId)
    if (cfg === undefined) {
      cfg = await connectedAccount(plan.organizationId)
      cfgCache.set(plan.organizationId, cfg)
    }
    if (!cfg?.accountId) continue

    const ok = await chargePlanInstallment(plan, cfg)
    if (ok) {
      result.charged++
      if (plan.installmentsPaid + 1 >= plan.installments) result.completed++
    } else {
      result.failed++
    }
  }

  return result
}

// ── Staff surfaces ───────────────────────────────────────────────────────────

export interface PaymentPlanView {
  id: string
  patientId: string
  patientName: string
  totalCents: number
  installmentCents: number
  installments: number
  installmentsPaid: number
  status: string
  nextChargeAt: Date | null
  lastError: string | null
  createdAt: Date
}

/** The patient's own open plan (proposed / active / past_due), for the portal
 *  Billing page — newest first so a re-proposed plan wins. Null when none. */
export async function getMyOpenPaymentPlan(
  organizationId: string,
  patientId: string,
): Promise<{
  id: string
  token: string
  status: string
  totalCents: number
  installmentCents: number
  installments: number
  installmentsPaid: number
  nextChargeAt: Date | null
} | null> {
  const [row] = await db
    .select({
      id: schema.paymentPlan.id,
      token: schema.paymentPlan.token,
      status: schema.paymentPlan.status,
      totalCents: schema.paymentPlan.totalCents,
      installmentCents: schema.paymentPlan.installmentCents,
      installments: schema.paymentPlan.installments,
      installmentsPaid: schema.paymentPlan.installmentsPaid,
      nextChargeAt: schema.paymentPlan.nextChargeAt,
    })
    .from(schema.paymentPlan)
    .where(
      and(
        eq(schema.paymentPlan.organizationId, organizationId),
        eq(schema.paymentPlan.patientId, patientId),
        inArray(schema.paymentPlan.status, ['proposed', 'active', 'past_due']),
      ),
    )
    .orderBy(desc(schema.paymentPlan.createdAt))
    .limit(1)
  return row ?? null
}

export async function listPaymentPlans(organizationId: string): Promise<PaymentPlanView[]> {
  const rows = await db
    .select({
      id: schema.paymentPlan.id,
      patientId: schema.paymentPlan.patientId,
      firstName: schema.patient.firstName,
      lastName: schema.patient.lastName,
      totalCents: schema.paymentPlan.totalCents,
      installmentCents: schema.paymentPlan.installmentCents,
      installments: schema.paymentPlan.installments,
      installmentsPaid: schema.paymentPlan.installmentsPaid,
      status: schema.paymentPlan.status,
      nextChargeAt: schema.paymentPlan.nextChargeAt,
      lastError: schema.paymentPlan.lastError,
      createdAt: schema.paymentPlan.createdAt,
    })
    .from(schema.paymentPlan)
    .innerJoin(schema.patient, eq(schema.patient.id, schema.paymentPlan.patientId))
    .where(eq(schema.paymentPlan.organizationId, organizationId))
    .orderBy(desc(schema.paymentPlan.createdAt))
    .limit(100)
  return rows.map((r) => ({
    id: r.id,
    patientId: r.patientId,
    patientName: `${r.firstName} ${r.lastName ?? ''}`.trim(),
    totalCents: r.totalCents,
    installmentCents: r.installmentCents,
    installments: r.installments,
    installmentsPaid: r.installmentsPaid,
    status: r.status,
    nextChargeAt: r.nextChargeAt,
    lastError: r.lastError,
    createdAt: r.createdAt,
  }))
}

/** Staff cancel — proposed/active/past_due only; history stays visible. */
export async function cancelPaymentPlan(
  organizationId: string,
  planId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const updated = await db
    .update(schema.paymentPlan)
    .set({ status: 'canceled', canceledAt: new Date(), nextChargeAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(schema.paymentPlan.id, planId),
        eq(schema.paymentPlan.organizationId, organizationId),
        inArray(schema.paymentPlan.status, ['proposed', 'active', 'past_due']),
        ne(schema.paymentPlan.status, 'canceled'),
      ),
    )
    .returning({ id: schema.paymentPlan.id })
  if (updated.length === 0) return { ok: false, error: 'This plan can’t be canceled (already finished?).' }
  return { ok: true }
}

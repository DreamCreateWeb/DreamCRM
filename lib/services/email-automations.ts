import 'server-only'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { applyMergeFields } from '@/lib/marketing/render-email'
import {
  EMAIL_AUTOMATION_SPECS,
  isEmailAutomationKey,
  normalizeEmailOverride,
  resolveEmailAutomations,
  type EmailAutomationKey,
  type EmailAutomationOverride,
  type EmailAutomationsConfig,
  type EmailSlots,
  type ResolvedEmail,
  type ResolvedEmailAutomations,
} from '@/lib/types/email-automations'

/**
 * Read/write + render the clinic-editable automated patient emails
 * (`clinic_profile.email_automations`). The registry + resolver live in the
 * client-safe lib/types/email-automations.ts; this server module owns the DB
 * access + the `{{token}}` render (reusing applyMergeFields).
 */

/**
 * Read the whole config, merged over defaults. Always complete, and
 * best-effort: a read failure degrades to the built-in default copy rather than
 * breaking a booking/cancellation/reminder send (the same defensive posture the
 * send paths themselves take).
 */
export async function getEmailAutomations(organizationId: string): Promise<ResolvedEmailAutomations> {
  try {
    const [row] = await db
      .select({ emailAutomations: schema.clinicProfile.emailAutomations })
      .from(schema.clinicProfile)
      .where(eq(schema.clinicProfile.organizationId, organizationId))
      .limit(1)
    return resolveEmailAutomations(row?.emailAutomations ?? null)
  } catch (err) {
    console.warn('[email-automations] read failed; using default copy:', err instanceof Error ? err.message : err)
    return resolveEmailAutomations(null)
  }
}

/** Raw stored config (only the clinic's deviations) — used by the save
 *  read-modify-write. Never trust its shape; callers re-normalize. */
async function getRawEmailAutomations(organizationId: string): Promise<EmailAutomationsConfig> {
  const [row] = await db
    .select({ emailAutomations: schema.clinicProfile.emailAutomations })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .limit(1)
  const stored = row?.emailAutomations
  return stored && typeof stored === 'object' ? (stored as EmailAutomationsConfig) : {}
}

/**
 * Persist one email's override. Normalizes first (drops empty + default-equal
 * slots), so an untouched Save clears the key and the send path falls back to
 * the in-code literal → byte-identical default. Removing the last deviation
 * deletes the key entirely.
 */
export async function saveEmailAutomationOverride(
  organizationId: string,
  key: EmailAutomationKey,
  override: EmailAutomationOverride,
): Promise<void> {
  const current = await getRawEmailAutomations(organizationId)
  const next: EmailAutomationsConfig = {}
  // Copy forward only the keys we still recognise (drops stale keys on write).
  for (const k of Object.keys(current)) {
    if (isEmailAutomationKey(k) && k !== key && current[k]) next[k] = current[k]
  }
  const cleaned = normalizeEmailOverride(key, override)
  if (cleaned) next[key] = cleaned
  await db
    .update(schema.clinicProfile)
    .set({ emailAutomations: next, updatedAt: new Date() })
    .where(eq(schema.clinicProfile.organizationId, organizationId))
}

export interface RenderedEmail {
  /** Only meaningful when the email's on/off lives in this column
   *  (booking_confirmation, cancellation, contact_ack). Other keys manage
   *  their on/off elsewhere — the caller ignores this. */
  enabled: boolean
  /** Convenience = full.subject (tokens applied). */
  subject: string
  /** Every slot merged over defaults, tokens applied. Used by service-built
   *  emails (reminder, review, contact-ack) that have no in-code literal. */
  full: EmailSlots
  /** ONLY the slots the clinic actually changed, tokens applied — passed to the
   *  templated email.ts senders, which fall back to their literal for the rest
   *  (so a default email stays byte-identical). */
  override: Partial<EmailSlots>
}

/**
 * Resolve + token-fill one email for a send. Reads the config once; a slot the
 * clinic didn't change surfaces in `full` (default text) but NOT in `override`.
 * `fields` are the `{{token}}` values the call site already has in scope.
 */
export async function renderAutomatedEmail(
  organizationId: string,
  key: EmailAutomationKey,
  fields: Record<string, string | null | undefined>,
): Promise<RenderedEmail> {
  const resolved = (await getEmailAutomations(organizationId))[key]
  return renderFromResolved(key, resolved, fields)
}

/** Pure render from an already-resolved email — exported for tests + reuse. */
export function renderFromResolved(
  key: EmailAutomationKey,
  resolved: ResolvedEmail,
  fields: Record<string, string | null | undefined>,
): RenderedEmail {
  const spec = EMAIL_AUTOMATION_SPECS[key]
  const sub = (t: string | undefined) => (t == null ? undefined : applyMergeFields(t, fields))

  const full: EmailSlots = {
    subject: applyMergeFields(resolved.subject, fields),
    body: applyMergeFields(resolved.body, fields),
    heading: sub(resolved.heading),
    closing: sub(resolved.closing),
  }

  // A slot that differs from its default was overridden (normalizeEmailOverride
  // guarantees stored slots never equal the default), so comparing the resolved
  // value to the default reliably tells override-vs-default.
  const override: Partial<EmailSlots> = {}
  for (const f of spec.slotFields) {
    const value = resolved[f.slot]
    if (value != null && value !== spec.slotDefaults[f.slot]) {
      override[f.slot] = applyMergeFields(value, fields)
    }
  }

  return { enabled: resolved.enabled, subject: full.subject, full, override }
}

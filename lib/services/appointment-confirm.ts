import 'server-only'
import { randomBytes } from 'crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { queueCommLogWriteBack } from '@/lib/services/pms'

/**
 * One-click appointment confirmation from the reminder email — the /c/[token]
 * public landing (token IS the auth; the /r and /w pattern). Before this, the
 * reminder email said "Reply CONFIRM" with no reply parsing and no link: the
 * only real confirm paths were staff clicking the drawer or the patient
 * finding the portal. Every competitor's reminder carries a one-tap confirm.
 *
 * The landing page shows the visit + a Confirm button (a POST server action —
 * never confirm on GET, or inbox link-prefetchers would "confirm" every
 * reminder they scan).
 */

/** Mint (or reuse) the appointment's confirm token. Null = appointment not
 *  found in this org. Reused across the journey's touches so every reminder
 *  email for one visit carries the same link. */
export async function getOrCreateConfirmToken(
  organizationId: string,
  appointmentId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: schema.appointment.id, confirmToken: schema.appointment.confirmToken })
    .from(schema.appointment)
    .where(
      and(
        eq(schema.appointment.organizationId, organizationId),
        eq(schema.appointment.id, appointmentId),
      ),
    )
    .limit(1)
  if (!row) return null
  if (row.confirmToken) return row.confirmToken

  const token = `ct_${randomBytes(18).toString('base64url')}`
  // Guard on still-null so two concurrent sends can't clobber each other's
  // token (the loser re-reads the winner's).
  await db
    .update(schema.appointment)
    .set({ confirmToken: token, updatedAt: new Date() })
    .where(and(eq(schema.appointment.id, appointmentId), isNull(schema.appointment.confirmToken)))
  const [after] = await db
    .select({ confirmToken: schema.appointment.confirmToken })
    .from(schema.appointment)
    .where(eq(schema.appointment.id, appointmentId))
    .limit(1)
  return after?.confirmToken ?? token
}

export interface ConfirmContext {
  /** 'pending' = show the Confirm button. */
  state: 'pending' | 'confirmed' | 'cancelled' | 'past'
  clinicName: string
  brandColor: string | null
  logoUrl: string | null
  clinicPhone: string | null
  slug: string | null
  patientFirstName: string
  startTime: Date
  visitTypeLabel: string
  providerName: string | null
  timeZone: string
  /** Prep instructions for this visit type ('' = none). */
  prepInstructions: string
}

function stateFor(status: string, startTime: Date): ConfirmContext['state'] {
  if (status === 'cancelled' || status === 'no_show') return 'cancelled'
  if (status === 'confirmed') return 'confirmed'
  if (startTime.getTime() < Date.now()) return 'past'
  return status === 'scheduled' ? 'pending' : 'past'
}

/** Load the confirm landing's context. Null = unknown token (404). */
export async function getConfirmContextByToken(token: string): Promise<ConfirmContext | null> {
  const [row] = await db
    .select({
      organizationId: schema.appointment.organizationId,
      status: schema.appointment.status,
      startTime: schema.appointment.startTime,
      type: schema.appointment.type,
      providerName: schema.clinicProvider.displayName,
      firstName: schema.patient.firstName,
    })
    .from(schema.appointment)
    .innerJoin(schema.patient, eq(schema.patient.id, schema.appointment.patientId))
    .leftJoin(schema.clinicProvider, eq(schema.clinicProvider.id, schema.appointment.providerId))
    .where(eq(schema.appointment.confirmToken, token))
    .limit(1)
  if (!row) return null

  const [profile] = await db
    .select({
      displayName: schema.clinicProfile.displayName,
      brandColor: schema.clinicProfile.brandColor,
      logoUrl: schema.clinicProfile.logoUrl,
      phone: schema.clinicProfile.phone,
      timezone: schema.clinicProfile.timezone,
      visitTypeSettings: schema.clinicProfile.visitTypeSettings,
    })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, row.organizationId))
    .limit(1)
  const [org] = await db
    .select({ slug: schema.organization.slug, name: schema.organization.name })
    .from(schema.organization)
    .where(eq(schema.organization.id, row.organizationId))
    .limit(1)

  const { visitTypePrepInstructions, findVisitType, resolveVisitTypes } = await import(
    '@/lib/types/visit-types'
  )
  const types = resolveVisitTypes(profile?.visitTypeSettings ?? null)
  const label = findVisitType(types, row.type)?.label ?? row.type.replace(/_/g, ' ')

  return {
    state: stateFor(row.status, row.startTime as Date),
    clinicName: profile?.displayName || org?.name || 'Your clinic',
    brandColor: profile?.brandColor ?? null,
    logoUrl: profile?.logoUrl ?? null,
    clinicPhone: profile?.phone ?? null,
    slug: org?.slug ?? null,
    patientFirstName: row.firstName,
    startTime: row.startTime as Date,
    visitTypeLabel: label,
    providerName: row.providerName ?? null,
    timeZone: profile?.timezone?.trim() || 'America/New_York',
    prepInstructions: visitTypePrepInstructions(profile?.visitTypeSettings ?? null, row.type),
  }
}

/**
 * Confirm the visit from the email landing. Idempotent — re-clicks report ok.
 * Only lifts scheduled → confirmed; a cancelled/past visit reports its state.
 */
export async function confirmVisitByToken(
  token: string,
): Promise<{ ok: boolean; state: ConfirmContext['state'] }> {
  const [row] = await db
    .select({
      id: schema.appointment.id,
      organizationId: schema.appointment.organizationId,
      patientId: schema.appointment.patientId,
      status: schema.appointment.status,
      startTime: schema.appointment.startTime,
    })
    .from(schema.appointment)
    .where(eq(schema.appointment.confirmToken, token))
    .limit(1)
  if (!row) return { ok: false, state: 'past' }

  const state = stateFor(row.status, row.startTime as Date)
  if (state === 'confirmed') return { ok: true, state: 'confirmed' } // idempotent re-click
  if (state !== 'pending') return { ok: false, state }

  await db
    .update(schema.appointment)
    .set({ status: 'confirmed', confirmedAt: new Date(), confirmedVia: 'email', updatedAt: new Date() })
    .where(
      and(
        eq(schema.appointment.id, row.id),
        eq(schema.appointment.status, 'scheduled'),
      ),
    )
  queueCommLogWriteBack(row.organizationId, row.patientId, {
    note: 'Appointment confirmed by the patient via the reminder-email link.',
    mode: 'Email',
  }).catch(() => {})
  return { ok: true, state: 'confirmed' }
}

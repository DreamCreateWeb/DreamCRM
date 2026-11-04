import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import type { PatientConsentView } from '@/lib/types/patient-consent'

/**
 * The READ half of the Consent card — what a chart says about marketing email
 * and texts. Reads only; every write goes through lib/services/sms-consent.ts
 * (the one-writer law). Dates leave as ISO strings; the card renders them in
 * the clinic's timezone.
 */
export async function getPatientConsent(
  organizationId: string,
  patientId: string,
): Promise<PatientConsentView | null> {
  const [p] = await db
    .select({
      emailOn: schema.patient.marketingEmailOptIn,
      emailAt: schema.patient.marketingEmailOptInAt,
      emailOffAt: schema.patient.marketingEmailOptOutAt,
      smsOn: schema.patient.marketingSmsOptIn,
      smsAt: schema.patient.marketingSmsOptInAt,
      smsOffAt: schema.patient.marketingSmsOptOutAt,
      source: schema.patient.marketingOptInSource,
    })
    .from(schema.patient)
    .where(and(eq(schema.patient.organizationId, organizationId), eq(schema.patient.id, patientId)))
    .limit(1)
  if (!p) return null
  const iso = (d: Date | null) => (d ? d.toISOString() : null)
  return {
    emailOn: p.emailOn === 1,
    emailOnAtIso: iso(p.emailAt),
    emailOffAtIso: iso(p.emailOffAt),
    smsOn: p.smsOn === 1,
    smsOnAtIso: iso(p.smsAt),
    smsOffAtIso: iso(p.smsOffAt),
    source: p.source,
  }
}

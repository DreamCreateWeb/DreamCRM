import 'server-only'
import { and, count, eq, gte } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { clinicMonthStart } from '@/lib/clinic-timezone'
import { INCLUDED_MONTHLY_INSURANCE_CHECKS, type InsuranceUsage } from '@/lib/insurance-eligibility'
import { getClinicTimeZone } from '@/lib/services/clinic-timezone'

/**
 * The included monthly allowance of BILLED checks (polish phase 6) — the
 * sibling of the SMS segment budget in lib/sms.ts. Counts `insurance_
 * verification` rows the live driver wrote since the clinic-local month
 * start; sandbox and test-mode rows are free and never counted. An error
 * row counts too: a check that reached the payer and failed was still
 * billed (Stedi bills the 270, not the answer).
 *
 * FAIL-OPEN BY LAW, like the SMS budget: an unreadable count reads as zero
 * used and `unreadable: true`, so a database hiccup never refuses a check at
 * the desk — it hides the counter instead.
 */

export function includedMonthlyInsuranceChecks(env: Record<string, string | undefined> = process.env): number {
  const v = Number.parseInt(env.INSURANCE_INCLUDED_MONTHLY_CHECKS ?? '', 10)
  return Number.isFinite(v) && v > 0 ? v : INCLUDED_MONTHLY_INSURANCE_CHECKS
}

export async function getInsuranceUsage(organizationId: string, now: Date = new Date()): Promise<InsuranceUsage> {
  const included = includedMonthlyInsuranceChecks()
  try {
    const timeZone = await getClinicTimeZone(organizationId)
    const since = clinicMonthStart(now, timeZone)
    const [row] = await db
      .select({ n: count() })
      .from(schema.insuranceVerification)
      .where(
        and(
          eq(schema.insuranceVerification.organizationId, organizationId),
          eq(schema.insuranceVerification.driver, 'stedi'),
          gte(schema.insuranceVerification.checkedAt, since),
        ),
      )
    return { used: Number(row?.n ?? 0), included, unreadable: false }
  } catch (e) {
    console.error('[insurance-eligibility] usage read failed (failing open):', e)
    return { used: 0, included, unreadable: true }
  }
}

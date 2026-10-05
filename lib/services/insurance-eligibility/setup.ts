import 'server-only'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { INSURANCE_INTRO, normalizeNpi } from '@/lib/insurance-eligibility'

/**
 * The insurance tool's ON switch (2026-10-05, self-serve setup). A clinic
 * turns the tool on from the intro card — one button, optionally the
 * practice NPI — and off again from the tool. A switch is a SETTING, like
 * the email-automation toggles: it is not work and not a report, so it is
 * deliberately NOT narrated in the Action Ledger (the marker law keeps
 * `report` to the Guardian). Both calls are idempotent: turning on twice
 * stamps once, turning off twice clears once.
 */

export type EnableInsuranceResult = { ok: true; enabledAt: Date; npi: string | null } | { ok: false; error: string }

export async function enableInsuranceTool(
  organizationId: string,
  opts: { npi?: string | null; requireNpi?: boolean; now?: Date } = {},
): Promise<EnableInsuranceResult> {
  const now = opts.now ?? new Date()
  const [profile] = await db
    .select({ enabledAt: schema.clinicProfile.insuranceEnabledAt, npi: schema.clinicProfile.npi })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .limit(1)

  // A typed NPI must be ten digits; an empty box keeps what is stored.
  const typed = (opts.npi ?? '').trim()
  const npi = typed ? normalizeNpi(typed) : normalizeNpi(profile?.npi)
  if (typed && !npi) return { ok: false, error: INSURANCE_INTRO.npiRefusal }
  if (opts.requireNpi && !npi) return { ok: false, error: INSURANCE_INTRO.npiRequired }

  const patch: Partial<typeof schema.clinicProfile.$inferInsert> = {}
  if (typed && npi && npi !== normalizeNpi(profile?.npi)) patch.npi = npi
  const enabledAt = profile?.enabledAt ?? now
  if (!profile?.enabledAt) patch.insuranceEnabledAt = now
  if (Object.keys(patch).length > 0) {
    await db.update(schema.clinicProfile).set(patch).where(eq(schema.clinicProfile.organizationId, organizationId))
  }
  return { ok: true, enabledAt, npi }
}

/** Clears the switch; true when this org had a profile row to clear. */
export async function disableInsuranceTool(organizationId: string): Promise<boolean> {
  const updated = await db
    .update(schema.clinicProfile)
    .set({ insuranceEnabledAt: null })
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .returning({ wasOn: schema.clinicProfile.organizationId })
  return updated.length > 0
}

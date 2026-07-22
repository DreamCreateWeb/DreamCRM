import 'server-only'
import { eq, inArray, and } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import type { PatientAudienceFilterT } from './marketing'

/**
 * The outreach-queue tiers — THE single definition of who needs outreach
 * and how (campaigns phase 1, 2026-07-21; moved out of the queue page so
 * the filters, audience names, and template categories have one home).
 *
 * Each tier maps to a stable saved audience (`ensureOutreachTierAudiences`
 * find-or-creates them by canonical name, so the queue's "Send" CTA can
 * never silently degrade the way the old name-based lookup could) and a
 * template category (the "Start from" picker preselects that template).
 * The canonical names intentionally match the demo seeder's audiences so
 * existing orgs adopt their already-seeded rows instead of duplicates.
 */

export type OutreachTierKey = 'recall_due' | 'lapsed' | 'new_patient' | 'birthday'

export interface OutreachTierDef {
  key: OutreachTierKey
  label: string
  description: string
  /** Canonical saved-audience name (matches the demo seeder's rows). */
  audienceName: string
  audienceDescription: string
  templateCategory: 'reactivation' | 'birthday' | 'welcome' | 'recall' | 'general'
  accent: 'amber' | 'rose' | 'emerald' | 'violet'
  filter: PatientAudienceFilterT
}

const baseFilter = {
  requireEmailOptIn: true,
  requireSmsOptIn: false,
  includeArchived: false,
}

export const OUTREACH_TIERS: OutreachTierDef[] = [
  {
    key: 'recall_due',
    label: 'Recall due',
    description: 'Last cleaning over 6 months ago, no future booking',
    audienceName: 'Recall due (6+ months)',
    audienceDescription:
      'Patients whose last cleaning was over 6 months ago without a future booking. Drives the Reactivation campaign.',
    templateCategory: 'reactivation',
    accent: 'amber',
    filter: { recallStatuses: ['due', 'overdue'], ...baseFilter },
  },
  {
    key: 'lapsed',
    label: 'Lapsed',
    description: "Haven't been in for over 9 months — the cold ones",
    audienceName: 'Lapsed (lifecycle = lapsed)',
    audienceDescription:
      'Lifecycle stage flipped to lapsed — last visit >9 months ago. Tighter than "Recall due" — these are the cold ones.',
    templateCategory: 'reactivation',
    accent: 'rose',
    // noUpcomingVisit (phase-4 suppression): a lapsed patient who already
    // rebooked doesn't need a win-back — nagging the returning reads badly.
    filter: { lifecycles: ['lapsed', 'at_risk'], noUpcomingVisit: true, ...baseFilter },
  },
  {
    key: 'new_patient',
    label: 'New patient welcome',
    description: 'Joined in the past 60 days — a good time to check in after their first visit',
    audienceName: 'New patients (past 60 days)',
    audienceDescription: 'Recently joined — for new-patient welcome sequences and check-in surveys.',
    templateCategory: 'welcome',
    accent: 'emerald',
    filter: { lifecycles: ['new'], ...baseFilter },
  },
  {
    key: 'birthday',
    label: 'Birthday this month',
    description: 'Patients celebrating a birthday this calendar month',
    audienceName: 'Birthday this month',
    audienceDescription: 'Patients celebrating a birthday this calendar month — for the warm-monthly outreach.',
    templateCategory: 'birthday',
    accent: 'violet',
    filter: { birthdayThisMonth: true, ...baseFilter },
  },
]

/**
 * Find-or-create the saved audience behind each tier and return
 * tierKey → audienceId. One SELECT when everything already exists (the
 * common case — the demo seeder and any prior visit create them);
 * missing rows are inserted with the canonical name + filter. Idempotent
 * and org-scoped.
 */
export async function ensureOutreachTierAudiences(
  organizationId: string,
): Promise<Map<OutreachTierKey, number>> {
  const names = OUTREACH_TIERS.map((t) => t.audienceName)
  const existing = await db
    .select({ id: schema.audiences.id, name: schema.audiences.name })
    .from(schema.audiences)
    .where(and(eq(schema.audiences.organizationId, organizationId), inArray(schema.audiences.name, names)))
  const idByName = new Map(existing.map((r) => [r.name, r.id]))

  const result = new Map<OutreachTierKey, number>()
  for (const tier of OUTREACH_TIERS) {
    let id = idByName.get(tier.audienceName)
    if (id === undefined) {
      const [row] = await db
        .insert(schema.audiences)
        .values({
          organizationId,
          name: tier.audienceName,
          description: tier.audienceDescription,
          recipientSource: 'patients',
          filter: {},
          patientFilter: tier.filter,
        })
        .returning({ id: schema.audiences.id })
      id = row.id
    } else {
      // Refresh the stored filter on reuse so a definition change here
      // (e.g. the phase-4 noUpcomingVisit suppression) propagates to every
      // existing org — same self-heal the automation audiences use.
      await db
        .update(schema.audiences)
        .set({ patientFilter: tier.filter, updatedAt: new Date() })
        .where(and(eq(schema.audiences.id, id), eq(schema.audiences.organizationId, organizationId)))
    }
    result.set(tier.key, id)
  }
  return result
}

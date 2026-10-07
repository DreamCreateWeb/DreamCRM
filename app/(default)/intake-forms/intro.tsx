import { count, eq } from 'drizzle-orm'
import { getTenantContext } from '@/lib/auth/context'
import { db, schema } from '@/lib/db'
import { listFormTemplates } from '@/lib/services/forms'
import { intakeSectionChoices, isUntouchedSeedTemplate } from '@/lib/types/forms'
import IntakeIntroCard from './intake-intro-card'

/**
 * THE INTAKE FORMS DOOR (docs/ACTIVATION.md S5). Off, the module is this
 * card: what it does, what to know, WHAT TO COLLECT (the standard
 * template's sections as choices, the basics always), a preview of what a
 * patient will see, how patients get it (the true sentence: with every
 * booking confirmation, new patients the full form), and one button —
 * which creates the practice's form from the chosen sections and turns
 * the switch on. A clinic that already has forms (grandfathered, or
 * turned off after use) keeps them: the button only flips the switch.
 */
export default async function IntakeIntro() {
  const ctx = await getTenantContext()
  if (!ctx || ctx.tenantType !== 'clinic') return null
  // Unreadable ≠ zero (audit round 1): a failed read says so on the card
  // rather than claiming "no forms" / "no patients".
  const [templates, patientCount] = await Promise.all([
    listFormTemplates(ctx.organizationId).catch(() => null),
    db
      .select({ n: count() })
      .from(schema.patient)
      .where(eq(schema.patient.organizationId, ctx.organizationId))
      .then((rows) => Number(rows[0]?.n ?? 0))
      .catch(() => null),
  ])
  // A form the practice actually made (or edited) counts; the untouched
  // seeded default does not — the picker is for exactly that clinic.
  const own = templates == null ? null : templates.filter((t) => t.archivedAt == null && !isUntouchedSeedTemplate(t)).length
  return (
    <IntakeIntroCard
      orgName={ctx.organizationName}
      canManage={ctx.role === 'owner' || ctx.role === 'admin'}
      sections={intakeSectionChoices()}
      existingForms={own}
      patientCount={patientCount}
    />
  )
}

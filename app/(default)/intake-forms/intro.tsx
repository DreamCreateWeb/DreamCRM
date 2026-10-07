import { count, eq } from 'drizzle-orm'
import { getTenantContext } from '@/lib/auth/context'
import { db, schema } from '@/lib/db'
import { splitIntakeFormsForDoor } from '@/lib/services/forms'
import { intakeSectionChoices } from '@/lib/types/forms'
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
  const [split, patientCount] = await Promise.all([
    splitIntakeFormsForDoor(ctx.organizationId).catch(() => null),
    db
      .select({ n: count() })
      .from(schema.patient)
      .where(eq(schema.patient.organizationId, ctx.organizationId))
      .then((rows) => Number(rows[0]?.n ?? 0))
      .catch(() => null),
  ])
  // A form the practice made or edited — or an untouched seed patients have
  // already answered — counts as THEIRS; the unanswered seed does not, and
  // the picker is for exactly that clinic. The action reads the SAME split
  // (audit round 3: the card showed a picker whose choices the action
  // then ignored).
  const own = split == null ? null : split.own.length
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

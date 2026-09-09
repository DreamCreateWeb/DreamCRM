import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { organization } from '@/lib/db/schema/auth'
import { deliver, authEmailShell } from '@/lib/email'
import { parseEmail, isJunkEmail } from '@/lib/prospect-email'

/**
 * Partner-program applications (marketing-engine Part 9 D①): the public
 * /partner-program form files straight into the PLATFORM org's sales
 * pipeline — the surface the owner already works daily — plus a
 * best-effort email alert to platform admins. No new table: an
 * application IS a lead (leadSource 'partner_program'), and the existing
 * pipeline's stages/notes/archive are exactly the right tooling for
 * "review → invite → onboard".
 */

export interface PartnerApplicationInput {
  name: string
  email: string
  phone?: string | null
  company?: string | null
  /** Free-text: what kind of partner + who they serve + anything else. */
  message?: string | null
}

export type PartnerApplicationResult = { ok: true } | { ok: false; error: string }

export const PARTNER_LEAD_SOURCE = 'partner_program'

export async function submitPartnerApplication(
  input: PartnerApplicationInput,
): Promise<PartnerApplicationResult> {
  const name = input.name.trim().slice(0, 200)
  const emailRaw = input.email.trim().slice(0, 200)
  if (!name) return { ok: false, error: 'Tell us your name.' }
  const parsed = parseEmail(emailRaw)
  if (!parsed || isJunkEmail(parsed.email)) {
    return { ok: false, error: 'We need a real email to get back to you.' }
  }
  const email = parsed.email

  // The platform org is the pipeline's home; its first owner anchors the row.
  const [platformOrg] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.type, 'platform'))
    .limit(1)
  if (!platformOrg) return { ok: false, error: 'Something went wrong — give it another try.' }
  const [owner] = await db
    .select({ userId: schema.member.userId })
    .from(schema.member)
    .where(and(eq(schema.member.organizationId, platformOrg.id), eq(schema.member.role, 'owner')))
    .limit(1)
  if (!owner) return { ok: false, error: 'Something went wrong — give it another try.' }

  const noteLines = [
    'Partner-program application (from /partner-program):',
    input.company?.trim() ? `Company: ${input.company.trim().slice(0, 200)}` : null,
    input.message?.trim() ? `About them: ${input.message.trim().slice(0, 2000)}` : null,
  ].filter((l): l is string => l !== null)

  // One application per email: a re-apply refreshes the notes rather than
  // minting a duplicate pipeline row the owner has to merge by hand.
  const [existing] = await db
    .select({ id: schema.customers.id, notes: schema.customers.notes })
    .from(schema.customers)
    .where(
      and(
        eq(schema.customers.organizationId, platformOrg.id),
        eq(schema.customers.email, email),
        eq(schema.customers.archived, false),
      ),
    )
    .limit(1)

  if (existing) {
    await db
      .update(schema.customers)
      .set({
        notes: [existing.notes, `Re-applied ${new Date().toISOString().slice(0, 10)}:`, ...noteLines]
          .filter(Boolean)
          .join('\n')
          .slice(0, 4000),
        updatedAt: new Date(),
      })
      .where(eq(schema.customers.id, existing.id))
  } else {
    await db.insert(schema.customers).values({
      organizationId: platformOrg.id,
      ownerId: owner.userId,
      name,
      email,
      phone: input.phone?.trim().slice(0, 40) || null,
      pipelineStage: 'new',
      leadSource: PARTNER_LEAD_SOURCE,
      notes: noteLines.join('\n') || null,
    })
  }

  // Best-effort alert — the pipeline row is the durable record; a mail
  // hiccup must never fail the applicant.
  try {
    const admins = await db
      .select({ email: schema.user.email })
      .from(schema.user)
      .where(eq(schema.user.platformAdmin, true))
      .limit(10)
    const to = admins.map((a) => a.email).filter((e): e is string => !!e)
    if (to.length > 0) {
      await deliver({
        to: to[0],
        subject: `Partner application: ${name}`,
        html: authEmailShell({
          heading: 'A partner wants in',
          introHtml: `<p><strong>${name.replace(/</g, '&lt;')}</strong> (${email}) just applied to the partner program.</p><p>${noteLines
            .map((l) => l.replace(/</g, '&lt;'))
            .join('<br/>')}</p><p>The application is in your pipeline under “Partner program”.</p>`,
        }),
      })
    }
  } catch {
    // The row landed; the alert is a courtesy.
  }

  return { ok: true }
}

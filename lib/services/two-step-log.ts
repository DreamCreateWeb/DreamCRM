import 'server-only'
import { and, desc, eq, inArray, ne } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { recordPatientAccess } from '@/lib/services/patient-access-log'

/**
 * Two-step sign-in changes in the access log (ML-58). Called from better-auth's
 * user-update hook with the row's CURRENT `twoFactorEnabled`; writes only when
 * that differs from the last thing logged for this person, so an unrelated
 * profile edit logs nothing. Written once per staff org the person belongs to
 * (org-scoped by law), `patientId` null, no secret and no code ever in the
 * detail. Best-effort: never throws into the auth path.
 */
export async function recordTwoStepChange(userId: string, enabled: boolean): Promise<void> {
  try {
    const [last] = await db
      .select({ action: schema.patientAccessLog.action })
      .from(schema.patientAccessLog)
      .where(
        and(
          eq(schema.patientAccessLog.userId, userId),
          inArray(schema.patientAccessLog.action, ['two_step_on', 'two_step_off']),
        ),
      )
      .orderBy(desc(schema.patientAccessLog.at))
      .limit(1)
    const wasOn = last?.action === 'two_step_on'
    if (enabled === wasOn) return
    if (!enabled && !last) return
    const orgs = await db
      .select({ organizationId: schema.member.organizationId })
      .from(schema.member)
      .where(and(eq(schema.member.userId, userId), ne(schema.member.role, 'patient')))
      .limit(10)
    for (const o of orgs) {
      await recordPatientAccess(o.organizationId, userId, enabled ? 'two_step_on' : 'two_step_off', null, null)
    }
  } catch (e) {
    console.error('[two-step-log] not recorded', e)
  }
}

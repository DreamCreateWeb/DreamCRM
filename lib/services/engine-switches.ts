import 'server-only'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { resolveReminderSettings } from '@/lib/types/reminders'

/**
 * THE ENGINE SWITCHES — one home (Phase 4; extracted from standup.ts when
 * the Guardian became its second reader, per the shared-assets convention).
 *
 * These are the two always-on-by-default engines whose absence explains
 * most silence in a clinic: appointment reminders
 * (`clinic_profile.reminders` jsonb, default enabled) and automatic review
 * requests (`clinic_review_config.autoSendEnabled`, default 1). The weekly
 * standup cross-checks them so a quiet week reads honestly to the CLINIC;
 * the Guardian reads the same two so a silent clinic reads honestly to the
 * PLATFORM. Two readers, one truth.
 *
 * Best-effort by contract: a read failure reads as "on", because nagging a
 * clinic (or the owner) about a switch we could not read is worse than
 * staying quiet.
 */
export interface EngineSwitches {
  remindersOn: boolean
  reviewRequestsOn: boolean
}

export async function readEngineSwitches(organizationId: string): Promise<EngineSwitches> {
  try {
    const [[profile], [reviewCfg]] = await Promise.all([
      db
        .select({ reminders: schema.clinicProfile.reminderSettings })
        .from(schema.clinicProfile)
        .where(eq(schema.clinicProfile.organizationId, organizationId))
        .limit(1),
      db
        .select({ autoSendEnabled: schema.clinicReviewConfig.autoSendEnabled })
        .from(schema.clinicReviewConfig)
        .where(eq(schema.clinicReviewConfig.organizationId, organizationId))
        .limit(1),
    ])
    return {
      remindersOn: resolveReminderSettings(profile?.reminders).enabled,
      // No config row yet = the DB default (1, on).
      reviewRequestsOn: (reviewCfg?.autoSendEnabled ?? 1) === 1,
    }
  } catch (e) {
    // Reads as "on" by contract (above) — but SAYS SO (round-9 audit; the
    // round-8 catch-logging sweep enumerated the files it remembered rather
    // than the files this phase touched, and this one was created by the
    // phase itself). Three readers depend on this answer: the standup's
    // quiet-week narration, the Guardian's verdict, and the clinic-facing
    // note's live re-verify. All three silently read "both on" here, so an
    // unreadable switch is indistinguishable from a switch that is on.
    console.error('[engine-switches] read failed, reading as on', e)
    return { remindersOn: true, reviewRequestsOn: true }
  }
}

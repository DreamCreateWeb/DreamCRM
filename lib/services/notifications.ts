import 'server-only'
import { and, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { sendNotificationEmail } from '@/lib/email'

/**
 * Notifications dispatcher + reader.
 *
 * Every event in the app that wants to surface to a user routes through
 * `notify()`. That function reads the user's preferences (`notification_prefs`
 * — one of `comments`, `candidates`, or `offers` is the controlling bucket),
 * short-circuits if `pushNothing` is set, otherwise inserts an in-app row.
 * If the user also has `pushEmail` on for that bucket, an email is sent via
 * the existing Resend wrapper.
 *
 * Buckets map onto the three toggles in /settings/notifications. The labels
 * shown to each tenant differ (see notifications-panel.tsx), but the columns
 * are stable so the dispatcher doesn't need to know about tenancy.
 *
 * Notifications are always best-effort: this module swallows its own errors
 * so triggers never block the originating action.
 */

export const NotificationBucket = z.enum(['comments', 'candidates', 'offers'])
export type NotificationBucket = z.infer<typeof NotificationBucket>

export interface NotifyInput {
  userId: string
  organizationId?: string | null
  bucket: NotificationBucket
  /** Short machine key — e.g. 'campaign_sent', 'inbox_message'. */
  type: string
  title: string
  body?: string | null
  /** Where clicking the notification should navigate the user. */
  linkPath?: string | null
  /**
   * Custom label for the email's action button (e.g. "View Sarah’s record →").
   * Email-only — the in-app notification row reads its title/body, so this is
   * not persisted; it just makes the emailed call-to-action specific.
   */
  linkLabel?: string | null
  /** Arbitrary structured data carried with the row. */
  meta?: Record<string, unknown>
  /** Set true to force-send the email even if `pushEmail` is off. */
  forceEmail?: boolean
}

interface PrefsRow {
  comments: boolean
  candidates: boolean
  offers: boolean
  pushEmail: boolean
  pushNothing: boolean
}

const DEFAULT_PREFS: PrefsRow = {
  comments: true,
  candidates: true,
  offers: false,
  pushEmail: true,
  pushNothing: false,
}

async function getPrefs(userId: string): Promise<PrefsRow> {
  const [row] = await db
    .select({
      comments: schema.notificationPrefs.comments,
      candidates: schema.notificationPrefs.candidates,
      offers: schema.notificationPrefs.offers,
      pushEmail: schema.notificationPrefs.pushEmail,
      pushNothing: schema.notificationPrefs.pushNothing,
    })
    .from(schema.notificationPrefs)
    .where(eq(schema.notificationPrefs.userId, userId))
    .limit(1)
  return row ?? DEFAULT_PREFS
}

/**
 * Dispatch a single notification. No-ops silently if the user has muted
 * the bucket (or all notifications). Failures are logged, not thrown — a
 * crashed notification dispatch must never break a triggering action.
 */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    const prefs = await getPrefs(input.userId)
    if (prefs.pushNothing && !input.forceEmail) return
    if (!prefs[input.bucket] && !input.forceEmail) return

    await db.insert(schema.notifications).values({
      userId: input.userId,
      organizationId: input.organizationId ?? null,
      bucket: input.bucket,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      linkPath: input.linkPath ?? null,
      meta: input.meta ?? {},
    })

    // Live-push so the header bell + sidebar badges update the instant this
    // lands, instead of on their next poll. User-targeted (only this recipient's
    // browser reacts); best-effort inside notify()'s own try/catch.
    if (input.organizationId) {
      const { publishRealtime } = await import('./realtime')
      await publishRealtime(
        input.organizationId,
        'notifications',
        { notificationType: input.type },
        { userId: input.userId },
      )
    }

    const shouldEmail = input.forceEmail || (prefs.pushEmail && prefs[input.bucket])
    if (shouldEmail) {
      const [u] = await db
        .select({ email: schema.user.email, name: schema.user.name })
        .from(schema.user)
        .where(eq(schema.user.id, input.userId))
        .limit(1)
      if (u?.email) {
        await sendNotificationEmail({
          to: u.email,
          name: u.name,
          title: input.title,
          body: input.body ?? '',
          linkPath: input.linkPath ?? null,
          linkLabel: input.linkLabel ?? null,
        })
      }
    }
  } catch (err) {
    console.warn('[notifications.notify] failed', err)
  }
}

/**
 * Notify every member of an organization that matches the optional role
 * filter. Used for events that aren't tied to a single recipient — e.g.
 * "a new patient inquiry just landed in the inbox" should ping all owners
 * + admins of the clinic, not one arbitrary person.
 */
export async function notifyOrgMembers(
  organizationId: string,
  input: Omit<NotifyInput, 'userId' | 'organizationId'>,
  opts: {
    roles?: string[]
    /**
     * Login email of the person whose ACTION triggered this alert (e.g. the
     * patient who just sent the message / left the feedback). Any recipient
     * whose account uses this email is skipped — nobody needs a staff alert
     * about their own action, and without this a dentist-owner who is also a
     * patient of their own clinic (or a platform admin booking a fake visit
     * mid-demo) receives internal staff mail at the "patient's" inbox.
     */
    excludeEmail?: string | null
  } = {},
): Promise<void> {
  try {
    // Staff alerts NEVER go to patient-role members — enforced HERE, not just
    // at call sites, so a future caller that forgets a roles filter can't
    // leak internal notifications to patients (defense in depth).
    const rolesFilter = opts.roles?.length
      ? inArray(schema.member.role, opts.roles)
      : ne(schema.member.role, 'patient')
    let rows = await db
      .select({ userId: schema.member.userId, email: schema.user.email })
      .from(schema.member)
      .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
      .where(and(eq(schema.member.organizationId, organizationId), rolesFilter))

    // Demo orgs have no real members (the "View as clinic" context is
    // synthesized from a cookie, not a membership row), so org events would
    // notify nobody and the bell would look broken in the exact surface the
    // platform admin demos from. Route demo-org events to platform admins —
    // the only people who can see a demo org.
    if (rows.length === 0) {
      const [org] = await db
        .select({ isDemo: schema.organization.isDemo })
        .from(schema.organization)
        .where(eq(schema.organization.id, organizationId))
        .limit(1)
      if (org?.isDemo) {
        rows = await db
          .select({ userId: schema.user.id, email: schema.user.email })
          .from(schema.user)
          .where(eq(schema.user.platformAdmin, true))
          .limit(10)
      }
    }

    const excluded = opts.excludeEmail?.trim().toLowerCase() || null
    const recipients = excluded
      ? rows.filter((r) => (r.email ?? '').toLowerCase() !== excluded)
      : rows

    await Promise.all(
      recipients.map((r) =>
        notify({ ...input, userId: r.userId, organizationId }),
      ),
    )
  } catch (err) {
    console.warn('[notifications.notifyOrgMembers] failed', err)
  }
}

// ---------- Reading ----------

export interface NotificationListItem {
  id: number
  bucket: string
  type: string
  title: string
  body: string | null
  linkPath: string | null
  readAt: string | null
  createdAt: string
}

export async function listNotifications(
  userId: string,
  opts: { limit?: number; unreadOnly?: boolean; organizationId?: string | null } = {},
): Promise<NotificationListItem[]> {
  const limit = Math.min(opts.limit ?? 20, 100)
  // Tenant scope: when an active org is known, only that org's rows (plus
  // legacy org-less notifications) are visible — a user who belongs to more
  // than one org never sees another org's bell while active elsewhere.
  const orgScope = opts.organizationId
    ? or(
        eq(schema.notifications.organizationId, opts.organizationId),
        isNull(schema.notifications.organizationId),
      )
    : undefined
  const where = and(
    eq(schema.notifications.userId, userId),
    opts.unreadOnly ? isNull(schema.notifications.readAt) : undefined,
    orgScope,
  )
  const rows = await db
    .select()
    .from(schema.notifications)
    .where(where)
    .orderBy(desc(schema.notifications.createdAt))
    .limit(limit)
  return rows.map((r) => ({
    id: r.id,
    bucket: r.bucket,
    type: r.type,
    title: r.title,
    body: r.body,
    linkPath: r.linkPath,
    readAt: r.readAt ? r.readAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }))
}

export async function countUnread(userId: string, organizationId?: string | null): Promise<number> {
  const orgScope = organizationId
    ? or(
        eq(schema.notifications.organizationId, organizationId),
        isNull(schema.notifications.organizationId),
      )
    : undefined
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.notifications)
    .where(
      and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt), orgScope),
    )
  return row?.n ?? 0
}

export async function markRead(userId: string, ids: number[]): Promise<void> {
  if (!ids.length) return
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(schema.notifications.userId, userId),
        inArray(schema.notifications.id, ids),
        isNull(schema.notifications.readAt),
      ),
    )
}

export async function markAllRead(userId: string): Promise<void> {
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt)),
    )
}

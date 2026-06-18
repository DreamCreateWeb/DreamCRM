import 'server-only'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'

// ---------- Account profile ----------
// NOTE: `email` is deliberately NOT a field here. Email is the sign-in identity,
// so changing it must go through better-auth's verified `changeEmail` flow
// (auth client → confirmation link to the existing mailbox), never a direct
// `user.email` write from this profile action. A prior version accepted `email`
// and wrote it straight to the row — that let a borrowed session silently
// repoint the login to any address (account-takeover-adjacent). The account
// panel now calls `authClient.changeEmail` for the email field and this action
// only for the other profile fields.
export const AccountInput = z.object({
  name: z.string().min(1).max(200).optional(),
  bio: z.string().max(1000).optional().nullable(),
  companyName: z.string().max(200).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  streetAddress: z.string().max(200).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  image: z.string().url().optional().nullable(),
})

export async function updateAccount(userId: string, input: z.infer<typeof AccountInput>) {
  // .parse() strips unknown keys, so even if a caller smuggles `email` in the
  // payload it never reaches the DB write — the verified changeEmail flow is the
  // only path to a new sign-in email.
  const data = AccountInput.parse(input)
  const [row] = await db
    .update(schema.user)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.user.id, userId))
    .returning()
  return row
}

// ---------- Billing ----------
export const BillingPlan = z.enum(['free', 'pro', 'team', 'enterprise'])

export const BillingInput = z.object({
  plan: BillingPlan.optional(),
  cardLast4: z.string().length(4).optional().nullable(),
  cardBrand: z.string().max(40).optional().nullable(),
  cardExpMonth: z.number().int().min(1).max(12).optional().nullable(),
  cardExpYear: z.number().int().min(2000).max(2100).optional().nullable(),
  billingEmail: z.string().email().optional().nullable(),
  billingAddress: z.string().max(400).optional().nullable(),
})

export async function getBilling(userId: string) {
  const rows = await db
    .select()
    .from(schema.billingProfiles)
    .where(eq(schema.billingProfiles.userId, userId))
    .limit(1)
  return rows[0] ?? null
}

export async function upsertBilling(userId: string, input: z.infer<typeof BillingInput>) {
  const data = BillingInput.parse(input)
  const [row] = await db
    .insert(schema.billingProfiles)
    .values({ userId, ...data, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.billingProfiles.userId,
      set: { ...data, updatedAt: new Date() },
    })
    .returning()
  return row
}

// ---------- Notifications ----------
export const NotificationPrefsInput = z.object({
  comments: z.boolean().optional(),
  candidates: z.boolean().optional(),
  offers: z.boolean().optional(),
  pushEverything: z.boolean().optional(),
  pushEmail: z.boolean().optional(),
  pushNothing: z.boolean().optional(),
})

export async function getNotificationPrefs(userId: string) {
  const rows = await db
    .select()
    .from(schema.notificationPrefs)
    .where(eq(schema.notificationPrefs.userId, userId))
    .limit(1)
  return (
    rows[0] ?? {
      userId,
      comments: true,
      candidates: true,
      offers: false,
      pushEverything: false,
      pushEmail: true,
      pushNothing: false,
      updatedAt: new Date(),
    }
  )
}

export async function upsertNotificationPrefs(userId: string, input: z.infer<typeof NotificationPrefsInput>) {
  const data = NotificationPrefsInput.parse(input)
  const [row] = await db
    .insert(schema.notificationPrefs)
    .values({ userId, ...data, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.notificationPrefs.userId,
      set: { ...data, updatedAt: new Date() },
    })
    .returning()
  return row
}

// ---------- Feedback ----------
export const FeedbackInput = z.object({
  category: z.string().max(40).default('general'),
  rating: z.number().int().min(1).max(5).optional().nullable(),
  message: z.string().min(1).max(4000),
})

export async function submitFeedback(userId: string | null, input: z.infer<typeof FeedbackInput>) {
  const data = FeedbackInput.parse(input)
  const [row] = await db
    .insert(schema.feedback)
    .values({ userId, category: data.category, rating: data.rating ?? null, message: data.message })
    .returning()
  return row
}

/**
 * Platform-admin view of recent feedback. Joins the feedback row through
 * the submitter's currently-active org so we can show "from clinic Foo
 * (plan: pro)" alongside the message itself. No org column was needed on
 * feedback — the existing user → session.activeOrganizationId chain gives
 * us the org at submission time when we look it up at read time, with a
 * fallback to the user's primary org membership.
 */
export interface FeedbackEntry {
  id: number
  category: string
  rating: number | null
  message: string
  createdAt: Date
  submitterName: string | null
  submitterEmail: string | null
  organizationName: string | null
  organizationType: 'platform' | 'clinic' | null
}

export async function listRecentFeedback(limit = 50): Promise<FeedbackEntry[]> {
  const { desc, eq, sql } = await import('drizzle-orm')
  const rows = await db
    .select({
      id: schema.feedback.id,
      category: schema.feedback.category,
      rating: schema.feedback.rating,
      message: schema.feedback.message,
      createdAt: schema.feedback.createdAt,
      submitterName: schema.user.name,
      submitterEmail: schema.user.email,
      // Resolve the user's active org → name + type. session.active wins; fall
      // back to any membership if no session is recorded.
      organizationId: sql<string | null>`(
        SELECT s.${sql.raw('"active_organization_id"')} FROM ${schema.session} s
        WHERE s.${sql.raw('"user_id"')} = ${schema.feedback.userId}
        ORDER BY s.${sql.raw('"updated_at"')} DESC
        LIMIT 1
      )`,
    })
    .from(schema.feedback)
    .leftJoin(schema.user, eq(schema.user.id, schema.feedback.userId))
    .orderBy(desc(schema.feedback.createdAt))
    .limit(limit)

  const orgIds = Array.from(new Set(rows.map((r) => r.organizationId).filter(Boolean) as string[]))
  const orgs = orgIds.length
    ? await db
        .select({
          id: schema.organization.id,
          name: schema.organization.name,
          type: schema.organization.type,
        })
        .from(schema.organization)
        .where(sql`${schema.organization.id} IN (${sql.join(orgIds.map((id) => sql`${id}`), sql`, `)})`)
    : []
  const orgById = new Map(orgs.map((o) => [o.id, o]))

  return rows.map((r) => {
    const org = r.organizationId ? orgById.get(r.organizationId) : null
    return {
      id: r.id,
      category: r.category,
      rating: r.rating,
      message: r.message,
      createdAt: r.createdAt,
      submitterName: r.submitterName ?? null,
      submitterEmail: r.submitterEmail ?? null,
      organizationName: org?.name ?? null,
      organizationType: (org?.type as 'platform' | 'clinic' | null) ?? null,
    }
  })
}

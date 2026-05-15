import 'server-only'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'

// ---------- Account profile ----------
export const AccountInput = z.object({
  name: z.string().min(1).max(200).optional(),
  companyName: z.string().max(200).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  streetAddress: z.string().max(200).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  image: z.string().url().optional().nullable(),
  email: z.string().email().optional(),
})

export async function updateAccount(userId: string, input: z.infer<typeof AccountInput>) {
  const data = AccountInput.parse(input)
  const [row] = await db
    .update(schema.users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.users.id, userId))
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

// ---------- Connected apps ----------
export const AppToggleInput = z.object({
  appKey: z.string().min(1).max(80),
  enabled: z.boolean(),
})

export async function listConnectedApps(userId: string) {
  return db.select().from(schema.connectedApps).where(eq(schema.connectedApps.userId, userId))
}

export async function setAppEnabled(userId: string, appKey: string, enabled: boolean) {
  const [row] = await db
    .insert(schema.connectedApps)
    .values({ userId, appKey, enabled })
    .onConflictDoUpdate({
      target: [schema.connectedApps.userId, schema.connectedApps.appKey],
      set: { enabled },
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

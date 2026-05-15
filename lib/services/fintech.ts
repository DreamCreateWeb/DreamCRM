import 'server-only'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'

export const CardInput = z.object({
  brand: z.string().min(1).max(40),
  last4: z.string().length(4).regex(/^\d{4}$/),
  expMonth: z.number().int().min(1).max(12),
  expYear: z.number().int().min(2000).max(2100),
  nickname: z.string().max(80).optional().nullable(),
  primary: z.boolean().optional(),
})

export const TransactionInput = z.object({
  merchant: z.string().min(1).max(120),
  amountCents: z.number().int(),
  category: z.string().max(40).optional(),
  currency: z.string().length(3).default('USD'),
  status: z.string().max(20).optional(),
  accountId: z.number().int().nullable().optional(),
  occurredAt: z.coerce.date().optional(),
})

export const AccountInput = z.object({
  name: z.string().min(1).max(120),
  type: z.string().max(40).default('checking'),
  balanceCents: z.number().int().default(0),
  currency: z.string().length(3).default('USD'),
})

export async function listAccounts(userId: string) {
  return db
    .select()
    .from(schema.accountsFinance)
    .where(eq(schema.accountsFinance.userId, userId))
    .orderBy(desc(schema.accountsFinance.createdAt))
}

export async function listCards(userId: string) {
  return db
    .select()
    .from(schema.finCards)
    .where(eq(schema.finCards.userId, userId))
    .orderBy(desc(schema.finCards.primary), desc(schema.finCards.createdAt))
}

export async function listTransactions(
  userId: string,
  opts: { limit?: number; accountId?: number; from?: Date } = {}
) {
  const filters = [eq(schema.transactions.userId, userId)]
  if (opts.accountId) filters.push(eq(schema.transactions.accountId, opts.accountId))
  if (opts.from) filters.push(gte(schema.transactions.occurredAt, opts.from))
  return db
    .select()
    .from(schema.transactions)
    .where(and(...filters))
    .orderBy(desc(schema.transactions.occurredAt))
    .limit(opts.limit ?? 100)
}

export async function accountBalance(userId: string) {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${schema.accountsFinance.balanceCents}), 0)::int`,
    })
    .from(schema.accountsFinance)
    .where(eq(schema.accountsFinance.userId, userId))
  return row?.total ?? 0
}

export async function portfolioSummary(userId: string) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const [bal] = await db
    .select({
      balance: sql<number>`coalesce(sum(${schema.accountsFinance.balanceCents}), 0)::int`,
      accounts: sql<number>`count(${schema.accountsFinance.id})::int`,
    })
    .from(schema.accountsFinance)
    .where(eq(schema.accountsFinance.userId, userId))

  const [income] = await db
    .select({
      total: sql<number>`coalesce(sum(${schema.transactions.amountCents}) filter (where ${schema.transactions.amountCents} > 0), 0)::int`,
      expenses: sql<number>`coalesce(sum(${schema.transactions.amountCents}) filter (where ${schema.transactions.amountCents} < 0), 0)::int`,
      txCount: sql<number>`count(${schema.transactions.id})::int`,
    })
    .from(schema.transactions)
    .where(and(eq(schema.transactions.userId, userId), gte(schema.transactions.occurredAt, since)))

  return {
    balanceCents: bal?.balance ?? 0,
    accountCount: bal?.accounts ?? 0,
    incomeCents: income?.total ?? 0,
    expenseCents: income?.expenses ?? 0,
    txCount30d: income?.txCount ?? 0,
  }
}

export async function createCard(userId: string, input: z.infer<typeof CardInput>) {
  const data = CardInput.parse(input)
  if (data.primary) {
    await db
      .update(schema.finCards)
      .set({ primary: false })
      .where(eq(schema.finCards.userId, userId))
  }
  const [row] = await db
    .insert(schema.finCards)
    .values({
      userId,
      brand: data.brand,
      last4: data.last4,
      expMonth: data.expMonth,
      expYear: data.expYear,
      nickname: data.nickname ?? null,
      primary: data.primary ?? false,
    })
    .returning()
  return row
}

export async function createTransaction(userId: string, input: z.infer<typeof TransactionInput>) {
  const data = TransactionInput.parse(input)
  const [row] = await db
    .insert(schema.transactions)
    .values({
      userId,
      merchant: data.merchant,
      amountCents: data.amountCents,
      category: data.category ?? 'other',
      currency: data.currency,
      status: data.status ?? 'completed',
      accountId: data.accountId ?? null,
      occurredAt: data.occurredAt ?? new Date(),
    })
    .returning()
  return row
}

export async function createAccount(userId: string, input: z.infer<typeof AccountInput>) {
  const data = AccountInput.parse(input)
  const [row] = await db
    .insert(schema.accountsFinance)
    .values({
      userId,
      name: data.name,
      type: data.type,
      balanceCents: data.balanceCents,
      currency: data.currency,
    })
    .returning()
  return row
}

export async function deleteCard(userId: string, id: number) {
  await db
    .delete(schema.finCards)
    .where(and(eq(schema.finCards.userId, userId), eq(schema.finCards.id, id)))
  return { ok: true }
}

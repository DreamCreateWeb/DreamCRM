import 'server-only'
import { and, desc, eq, sql } from 'drizzle-orm'
import { randomBytes } from 'crypto'
import { db, schema } from '@/lib/db'
import type { CouponRow, DiscountType, CouponSource } from '@/lib/types/shop'

/**
 * Shop coupons — manual promo codes + auto-generated single-use birthday
 * codes (off the patient DOB we already store). Validated server-side at
 * checkout; the discount is applied as a one-time Stripe coupon on the
 * clinic's connected account (see shop-checkout).
 */

export type { CouponRow } from '@/lib/types/shop'

export function newCouponId(): string {
  return `coupon_${randomBytes(10).toString('hex')}`
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '')
}

export interface CreateCouponInput {
  code: string
  discountType: DiscountType
  discountValue: number
  minSubtotalCents?: number | null
  expiresAt?: Date | null
  singleUse?: boolean
  source?: CouponSource
  patientId?: string | null
}

export async function createCoupon(organizationId: string, input: CreateCouponInput): Promise<string> {
  const id = newCouponId()
  await db.insert(schema.shopCoupon).values({
    id,
    organizationId,
    code: normalizeCode(input.code),
    discountType: input.discountType,
    discountValue: input.discountValue,
    minSubtotalCents: input.minSubtotalCents ?? null,
    expiresAt: input.expiresAt ?? null,
    singleUse: input.singleUse === false ? 0 : 1,
    source: input.source ?? 'manual',
    patientId: input.patientId ?? null,
  })
  return id
}

export async function listCoupons(organizationId: string): Promise<CouponRow[]> {
  const rows = await db
    .select({ c: schema.shopCoupon, firstName: schema.patient.firstName, lastName: schema.patient.lastName })
    .from(schema.shopCoupon)
    .leftJoin(schema.patient, eq(schema.shopCoupon.patientId, schema.patient.id))
    .where(eq(schema.shopCoupon.organizationId, organizationId))
    .orderBy(desc(schema.shopCoupon.createdAt))
  return rows.map((r) => ({
    id: r.c.id,
    code: r.c.code,
    discountType: r.c.discountType as DiscountType,
    discountValue: r.c.discountValue,
    source: r.c.source as CouponSource,
    singleUse: r.c.singleUse === 1,
    minSubtotalCents: r.c.minSubtotalCents,
    patientId: r.c.patientId,
    patientName: r.firstName ? `${r.firstName} ${r.lastName ?? ''}`.trim() : null,
    active: r.c.active === 1,
    expiresAt: r.c.expiresAt,
    usedAt: r.c.usedAt,
    createdAt: r.c.createdAt,
  }))
}

export async function deactivateCoupon(organizationId: string, id: string): Promise<void> {
  await db
    .update(schema.shopCoupon)
    .set({ active: 0, updatedAt: new Date() })
    .where(and(eq(schema.shopCoupon.organizationId, organizationId), eq(schema.shopCoupon.id, id)))
}

export interface CouponValidation {
  ok: boolean
  error?: string
  couponId?: string
  discountType?: DiscountType
  discountValue?: number
  discountCents?: number
}

/** Validate a code against a cart subtotal + compute the discount in cents. */
export async function validateCoupon(
  organizationId: string,
  code: string,
  subtotalCents: number,
): Promise<CouponValidation> {
  if (!code.trim()) return { ok: false, error: 'Enter a code' }
  const [c] = await db
    .select()
    .from(schema.shopCoupon)
    .where(and(eq(schema.shopCoupon.organizationId, organizationId), eq(schema.shopCoupon.code, normalizeCode(code))))
    .limit(1)
  if (!c || c.active !== 1) return { ok: false, error: 'That code isn’t valid.' }
  if (c.expiresAt && c.expiresAt.getTime() < Date.now()) return { ok: false, error: 'That code has expired.' }
  if (c.singleUse === 1 && c.usedAt) return { ok: false, error: 'That code has already been used.' }
  if (c.minSubtotalCents && subtotalCents < c.minSubtotalCents) {
    return { ok: false, error: `Minimum order of $${(c.minSubtotalCents / 100).toFixed(0)} for this code.` }
  }
  const discountCents =
    c.discountType === 'percent'
      ? Math.round((subtotalCents * c.discountValue) / 100)
      : Math.min(c.discountValue, subtotalCents)
  return { ok: true, couponId: c.id, discountType: c.discountType as DiscountType, discountValue: c.discountValue, discountCents }
}

export async function markCouponUsed(couponId: string, orderId: string): Promise<void> {
  // Only flips single-use codes; multi-use stays available.
  await db
    .update(schema.shopCoupon)
    .set({ usedAt: new Date(), usedOrderId: orderId, updatedAt: new Date() })
    .where(and(eq(schema.shopCoupon.id, couponId), eq(schema.shopCoupon.singleUse, 1)))
}

/**
 * Auto-generate single-use birthday coupons for patients whose birthday falls
 * this month and who don't already have an active birthday coupon. Returns the
 * number created. Idempotent within a month.
 */
export async function generateBirthdayCoupons(
  organizationId: string,
  opts: { discountType?: DiscountType; discountValue?: number } = {},
): Promise<number> {
  const discountType = opts.discountType ?? 'percent'
  const discountValue = opts.discountValue ?? 15
  const month = String(new Date().getMonth() + 1).padStart(2, '0')

  const patients = await db
    .select({ id: schema.patient.id })
    .from(schema.patient)
    .where(
      and(
        eq(schema.patient.organizationId, organizationId),
        eq(schema.patient.isActive, 1),
        sql`substr(${schema.patient.dateOfBirth}, 6, 2) = ${month}`,
      ),
    )

  if (patients.length === 0) return 0

  // Skip patients who already have an active birthday coupon (any active one —
  // keeps it idempotent across re-runs in the same month).
  const existing = await db
    .select({ patientId: schema.shopCoupon.patientId })
    .from(schema.shopCoupon)
    .where(
      and(
        eq(schema.shopCoupon.organizationId, organizationId),
        eq(schema.shopCoupon.source, 'birthday'),
        eq(schema.shopCoupon.active, 1),
      ),
    )
  const have = new Set(existing.map((e) => e.patientId).filter(Boolean) as string[])

  const toCreate = patients.filter((p) => !have.has(p.id))
  if (toCreate.length === 0) return 0

  const expiresAt = new Date()
  expiresAt.setMonth(expiresAt.getMonth() + 2) // ~end of next month

  await db.insert(schema.shopCoupon).values(
    toCreate.map((p) => ({
      id: newCouponId(),
      organizationId,
      code: `BDAY-${randomBytes(3).toString('hex').toUpperCase()}`,
      discountType,
      discountValue,
      source: 'birthday' as const,
      singleUse: 1,
      patientId: p.id,
      expiresAt,
    })),
  )
  return toCreate.length
}

/**
 * Loyalty program (client-safe types + resolver). DI's points feature, with
 * the redemption side no vendor can match: points spend in the clinic's OWN
 * shop as a single-use coupon. Strictly opt-in (default OFF); earn values
 * are clinic-configurable within sane clamps.
 */

export interface LoyaltySettings {
  enabled: boolean
  /** Points for a kept (completed) visit. */
  pointsPerVisit: number
  /** Points when a friend you referred completes their first visit. */
  pointsPerReferral: number
  /** Points for an online balance payment. */
  pointsPerPayment: number
  /** Points needed to redeem. */
  redeemPoints: number
  /** Shop-coupon value (cents) a redemption mints. */
  redeemValueCents: number
}

export const LOYALTY_DEFAULTS: LoyaltySettings = {
  enabled: false,
  pointsPerVisit: 10,
  pointsPerReferral: 50,
  pointsPerPayment: 10,
  redeemPoints: 100,
  redeemValueCents: 1_000, // $10 off in the shop
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? Math.round(v) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** Merge a stored jsonb blob over defaults, clamping every number. */
export function resolveLoyaltySettings(raw: unknown): LoyaltySettings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<LoyaltySettings>
  return {
    enabled: o.enabled === true,
    pointsPerVisit: clampInt(o.pointsPerVisit, 0, 1_000, LOYALTY_DEFAULTS.pointsPerVisit),
    pointsPerReferral: clampInt(o.pointsPerReferral, 0, 5_000, LOYALTY_DEFAULTS.pointsPerReferral),
    pointsPerPayment: clampInt(o.pointsPerPayment, 0, 1_000, LOYALTY_DEFAULTS.pointsPerPayment),
    redeemPoints: clampInt(o.redeemPoints, 10, 100_000, LOYALTY_DEFAULTS.redeemPoints),
    redeemValueCents: clampInt(o.redeemValueCents, 100, 100_000, LOYALTY_DEFAULTS.redeemValueCents),
  }
}

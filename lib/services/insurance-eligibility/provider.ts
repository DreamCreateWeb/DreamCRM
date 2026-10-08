import 'server-only'
import type { EligibilityRequest, EligibilityResult, InsuranceDriverId } from '@/lib/insurance-eligibility'

/**
 * The one door every eligibility source walks through. `check` may THROW —
 * the service catches and stores an `error` row — and it must never write to
 * the database itself: persistence, the ledger line and the demo gate are the
 * service's job so every driver inherits them.
 */
export interface EligibilityAnswer {
  result: EligibilityResult
  /** The payer's response as received (the 271 as JSON), kept on the row so
   *  a field the normalizer doesn't read yet can be mined later without a
   *  second billed check. Null for drivers with nothing behind them. */
  raw: unknown | null
}

export interface EligibilityProvider {
  id: InsuranceDriverId
  check(req: EligibilityRequest, ctx: { now: Date; organizationId: string }): Promise<EligibilityAnswer>
}

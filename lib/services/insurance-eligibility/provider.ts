import 'server-only'
import type { EligibilityRequest, EligibilityResult, InsuranceDriverId } from '@/lib/insurance-eligibility'

/**
 * The one door every eligibility source walks through. `check` may THROW —
 * the service catches and stores an `error` row — and it must never write to
 * the database itself: persistence, the ledger line and the demo gate are the
 * service's job so every driver inherits them.
 */
export interface EligibilityProvider {
  id: InsuranceDriverId
  check(req: EligibilityRequest, ctx: { now: Date; organizationId: string }): Promise<EligibilityResult>
}

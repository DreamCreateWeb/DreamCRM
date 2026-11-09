import { checkRecognisedCard, INSURANCE_RANK_LABEL, type EligibilityStatus, type InsuranceRank } from '@/lib/insurance-eligibility'
import { formatClinicDate } from '@/lib/format-datetime'

/**
 * What the portal's "Insurance on file" card says about verification — the
 * truth, in three states:
 *  - the practice's insurance tool is OFF → nothing at all (no promise the
 *    practice never made);
 *  - the tool is on, no recognised check on file → the standing promise;
 *  - a recognised check exists → what it found, dated in the CLINIC's zone
 *    (an active card reads "Verified <date> · <plan>", never a stale promise).
 * Pure: the page does the reads, this does the words.
 */
export interface PortalInsuranceNote {
  tone: 'verified' | 'attention' | 'pending'
  text: string
}

export function portalInsuranceNote(opts: {
  toolOn: boolean
  check: { status: EligibilityStatus; checkedAtIso: string; planName: string | null; payerName: string | null } | null
  timeZone: string
}): PortalInsuranceNote | null {
  if (!opts.toolOn) return null
  const c = opts.check
  if (!c || !checkRecognisedCard(c.status)) {
    return {
      tone: 'pending',
      text: 'We’ll verify your coverage before treatment — bring your card to your first visit and we’ll handle the rest.',
    }
  }
  const when = formatClinicDate(new Date(c.checkedAtIso), opts.timeZone)
  const plan = c.planName?.trim() || c.payerName?.trim() || null
  if (c.status === 'active') {
    return { tone: 'verified', text: plan ? `Verified ${when} · ${plan}` : `Verified ${when}` }
  }
  if (c.status === 'inactive') {
    return {
      tone: 'attention',
      text: `Checked ${when} — the carrier doesn’t show this coverage as active. Please call us so we can sort it out together.`,
    }
  }
  return { tone: 'attention', text: `Checked ${when} — the office is looking over the details and will follow up if anything is needed.` }
}

/** One plan on the portal's "Insurance on file" card (ML-50). */
export interface PortalInsurancePlan {
  rank: InsuranceRank
  /** "Primary plan" / "Secondary plan" — shown only when there is more than one plan to tell apart. */
  heading: string | null
  carrier: string | null
  memberId: string | null
  groupNumber: string | null
  note: PortalInsuranceNote | null
}

type PlanCheck = Parameters<typeof portalInsuranceNote>[0]['check']

/**
 * Both plans' cards with their OWN "last verified" line, through the one note
 * helper above (never a second wording). The primary is always listed (its
 * "Not on file" rows are the patient's door to add it); a secondary only when
 * one is on the record. The practice's switch off → no verifying copy on
 * either. Each plan reads the latest recognised check OF ITS RANK only.
 */
export function portalInsurancePlans(opts: {
  toolOn: boolean
  primary: { carrier: string | null; memberId: string | null; groupNumber: string | null }
  primaryCheck: PlanCheck
  secondary: { carrier: string | null; memberId: string | null; groupNumber: string | null } | null
  secondaryCheck: PlanCheck
  timeZone: string
}): PortalInsurancePlan[] {
  const two = !!opts.secondary
  const plan = (
    rank: InsuranceRank,
    card: { carrier: string | null; memberId: string | null; groupNumber: string | null },
    check: PlanCheck,
  ): PortalInsurancePlan => ({
    rank,
    heading: two ? `${INSURANCE_RANK_LABEL[rank]} plan` : null,
    carrier: card.carrier,
    memberId: card.memberId,
    groupNumber: card.groupNumber,
    note: portalInsuranceNote({ toolOn: opts.toolOn, check, timeZone: opts.timeZone }),
  })
  const out = [plan('primary', opts.primary, opts.primaryCheck)]
  if (opts.secondary) out.push(plan('secondary', opts.secondary, opts.secondaryCheck))
  return out
}

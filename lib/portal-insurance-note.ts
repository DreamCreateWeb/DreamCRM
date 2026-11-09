import { checkRecognisedCard, type EligibilityStatus } from '@/lib/insurance-eligibility'
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

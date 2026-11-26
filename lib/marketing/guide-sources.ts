/**
 * THE OUTSIDE PAGES A GUIDE QUOTES — one shape, read first-hand, dated.
 *
 * The comparison registry learned this the expensive way (two false "no price
 * published" lines, live for a day, 2026-11-24): a fact about somebody else is
 * only as good as the page it was read from and the day it was read. The
 * growth guides had never quoted an outside rule before the no-show policy
 * guide, which has to — it tells a practice which patients it may not charge.
 * So the guides get the same discipline the comparisons have, as data:
 *
 *   - `quote` is WORD FOR WORD. A paraphrase of a rule is a new rule, written
 *     by us. `tests/marketing/no-show-policy-guide.test.tsx` pins each quote
 *     and requires it on the page.
 *   - `readOn` is the day WE read it, not the day it was written. `pageSays`
 *     is the date the page states about itself, when it states one.
 *   - A SOURCE THAT REFUSED TO BE READ IS NOT HERE. The federal guidance the
 *     two state pages below rest on returned 403 to our reader on 2026-11-25
 *     (hhs.gov), as did Colorado's policy statement and Utah's provider
 *     slides. None is cited. North Carolina's page QUOTES the federal agency,
 *     and that quotation is attributed to North Carolina's page, which is
 *     where it was read.
 *
 * Client-safe: plain data, no imports.
 */

export interface GuideSource {
  /** Who published it, in the words a reader would use. */
  label: string
  url: string
  /** ISO day we read it. */
  readOn: string
  /** The sentence taken from it, word for word. */
  quote?: string
  /** A date the page states about itself. */
  pageSays?: string
}

export const NO_SHOW_SOURCES = {
  /**
   * NC Medicaid, "Provider Billing of Medicaid Beneficiaries" — the state
   * program's own document. Also the page the Medicare and covered-services
   * quotations on the guide are read from.
   */
  ncMedicaid: {
    label: 'North Carolina Medicaid’s provider billing page',
    url: 'https://medicaid.ncdhhs.gov/providers-billing-missed-appt/open',
    readOn: '2026-11-25',
    quote: 'Providers may NOT bill Medicaid beneficiaries for missed appointments.',
  },
  /** The California Dental Association, on Medi-Cal — and on dismissal. */
  cda: {
    label: 'the California Dental Association',
    url: 'https://www.cda.org/newsroom/medi-cal-denti-cal/when-medi-cal-patients-miss-dental-appointments-how-to-respond-and-reschedule/',
    readOn: '2026-11-25',
    quote: 'Providers cannot bill Medi-Cal recipients for missed appointments.',
    pageSays: 'August 13, 2025',
  },
  /** Open Dental's manual, "Break Appointment" — what each code is for. */
  openDental: {
    label: 'Open Dental’s manual',
    url: 'https://opendental.com/manual/apptbreak.html',
    readOn: '2026-11-25',
    quote: 'This is used when the patient simply did not show up for the appointment.',
  },
  /** Dentrix Enterprise's blog — post the code whether or not you charge. */
  dentrix: {
    label: 'the Dentrix Enterprise blog',
    url: 'https://blog.dentrixenterprise.com/why-you-should-document-missed-appointments/',
    readOn: '2026-11-25',
  },
} satisfies Record<string, GuideSource>

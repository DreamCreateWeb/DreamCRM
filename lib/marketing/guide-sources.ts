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

/**
 * THE RULE ON REMINDER CALLS AND TEXTS — 47 CFR 64.1200(a)(9)(iv), the
 * conditions on a health-care provider's messages.
 *
 * Read at Cornell's Legal Information Institute, and labelled so: the
 * government's own copies (ecfr.gov, govinfo.gov) refused the reader on
 * 2026-11-25. Each condition is a FRAGMENT of one lettered paragraph, word
 * for word; `tests/marketing/reminder-templates-guide.test.tsx` pins all
 * seven. `optOut` stops before the rule's own inner quotation marks so the
 * page never has to re-punctuate the regulation.
 */
export const REMINDER_RULE = {
  source: {
    label: 'the federal calling rule, 47 CFR 64.1200(a)(9)(iv), as published by Cornell’s Legal Information Institute',
    url: 'https://www.law.cornell.edu/cfr/text/47/64.1200',
    readOn: '2026-11-25',
  } satisfies GuideSource,
  conditions: {
    purposes: 'appointment and exam confirmations and reminders',
    identify: 'must state the name and contact information of the healthcare provider',
    noBilling: 'may not include accounting, billing, debt-collection, or other financial content',
    length: '160 characters or less in length for text messages',
    frequency:
      'A healthcare provider may initiate only one message (whether by voice call or text message) per day to each patient, up to a maximum of three voice calls or text messages combined per week to each patient',
    optOut: 'must inform recipients of the ability to opt out by replying',
    honor: 'must honor opt-out requests immediately.',
  },
} as const

/**
 * WHAT GOOGLE AND THE FTC SAY ABOUT ASKING FOR REVIEWS — the review request
 * guide's sources. Every string under `says` is a fragment of the page named
 * beside it, word for word; `tests/marketing/review-request-guide.test.tsx`
 * pins each one.
 *
 * Google's two pages were read as served on 2026-11-25. The FTC's rule was
 * read at Cornell's Legal Information Institute and is labelled so (the
 * government's own copy of the Code of Federal Regulations refuses the
 * reader). The rule's section on reviews by a business's own people (465.5)
 * is NAMED on the guide, by its title, and not summarised: it runs to
 * conditions a one-line paraphrase would get wrong.
 */
export const REVIEW_RULES = {
  googlePolicy: {
    source: {
      label: 'Google’s Maps user-generated content policy',
      url: 'https://support.google.com/contributionpolicy/answer/7400114',
      readOn: '2026-11-25',
    } satisfies GuideSource,
    says: {
      incentives:
        'Offer incentives – such as payment, discounts, free goods and/or services - in exchange for posting any review or revision or removal of a negative review.',
      gating: 'Discourage or prohibit negative reviews, or selectively solicit positive reviews from customers',
      pressure:
        'should not require or pressure users to leave ratings or write reviews while on the premises, nor should they request that specific content be included.',
      quota: 'Merchants requesting that staff solicit a certain number of reviews',
      naming:
        'Merchants requesting that staff solicit reviews that include specific content, including content that identifies a staff member.',
      conflict: 'A conflict of interest may include current or former employment',
      allowed:
        'Solicit or encourage the posting of content that does represent a genuine experience, without offering incentives to do so or attempting to influence the rating or the contents of the review.',
    },
  },
  googleTips: {
    source: {
      label: 'Google Business Profile Help, “Tips to get more reviews”',
      url: 'https://support.google.com/business/answer/3474122',
      readOn: '2026-11-25',
    } satisfies GuideSource,
    says: {
      link: 'you can ask customers to visit a Google link or scan a QR code',
      mix: 'A mix of positive and negative feedback often feels more trustworthy.',
    },
  },
  ftc: {
    source: {
      label: 'the FTC’s rule on consumer reviews, 16 CFR 465.4, as published by Cornell’s Legal Information Institute',
      url: 'https://www.law.cornell.edu/cfr/text/16/465.4',
      readOn: '2026-11-25',
    } satisfies GuideSource,
    says: {
      incentives:
        'It is an unfair or deceptive act or practice and a violation of this part for a business to provide compensation or other incentives in exchange for, or conditioned expressly or by implication on, the writing or creation of consumer reviews expressing a particular sentiment, whether positive or negative, regarding the product, service, or business that is the subject of the review.',
    },
  },
  ftcInsiders: {
    source: {
      label: 'the same rule’s section on a business’s own people, 16 CFR 465.5',
      url: 'https://www.law.cornell.edu/cfr/text/16/465.5',
      readOn: '2026-11-26',
    } satisfies GuideSource,
    says: {
      title: 'Insider consumer reviews and consumer testimonials',
    },
  },
} as const

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

/**
 * WHEN A NEW PATIENT IS OWED THE PRIVACY NOTICE — 45 CFR 164.520(c)(2), the
 * welcome guide's one outside rule.
 *
 * Read at Cornell's Legal Information Institute and labelled so. Each string
 * is a fragment of the regulation, word for word, pinned in
 * `tests/marketing/welcome-letter-guide.test.tsx`. The guide names the rule
 * by its citation and never by the statute's four-letter name: nothing on
 * the marketing site may read as a claim about OUR standing under it
 * (`docs/COMPLIANCE.md`), and a page that used the name beside our product
 * would invite exactly that reading.
 */
/**
 * GOOGLE'S OWN INSTRUCTIONS FOR THE REVIEW LINK AND ITS QR CODE — the page
 * the review card maker (`/google-review-card`) rests on.
 *
 * It is its own export, not a key of `REVIEW_RULES`, because the
 * review-request guide's test requires every line of `REVIEW_RULES` to be
 * printed on THAT guide, and these lines are printed on the maker's page. The
 * maker's test (`tests/marketing/review-card-page.test.tsx`) pins each one
 * and requires it there.
 *
 * `readReviews`, `getMore` and `profile` are the LABELS of the steps, quoted
 * as labels: between the first two the page shows an arrow image whose
 * alternative text is "and then", so the sequence is written in our words
 * around Google's.
 *
 * NOT HERE: the shape of the link itself. The product builds its own from a
 * place ID (`lib/services/reviews.ts`), but no page of Google's that we read
 * states that shape, so the maker builds no link: it prints the one Google
 * hands the practice.
 */
export const REVIEW_LINK_HELP = {
  source: {
    label: 'Google Business Profile Help, “Create a Google link or QR code to request reviews”',
    url: 'https://support.google.com/business/answer/16816815',
    readOn: '2026-11-26',
  } satisfies GuideSource,
  says: {
    purpose:
      'To make it easier for customers to leave reviews on your Business Profile, you can create and share a link or QR code to request reviews.',
    profile: 'Go to your Business Profile',
    readReviews: 'Read Reviews',
    getMore: 'Get more reviews',
    copy: 'To copy the review link, select Copy',
    desktopOnly: 'Currently, reviews QR codes can only be generated on a computer browser, not on mobile devices.',
    display: 'Print and display the QR code in your store',
    incentives:
      'Offering incentives, like free or discounted goods or services, to customers in exchange for reviews is considered fake engagement and is strictly prohibited.',
  },
} as const

export const PRIVACY_NOTICE_RULE = {
  source: {
    label: 'the federal privacy rule, 45 CFR 164.520(c)(2), as published by Cornell’s Legal Information Institute',
    url: 'https://www.law.cornell.edu/cfr/text/45/164.520',
    readOn: '2026-11-26',
  } satisfies GuideSource,
  says: {
    who: 'A covered health care provider that has a direct treatment relationship with an individual must',
    when: 'No later than the date of the first service delivery',
    acknowledgment: 'make a good faith effort to obtain a written acknowledgment of receipt of the notice',
    onSite: 'Have the notice available at the service delivery site for individuals to request to take with them',
    posted: 'Post the notice in a clear and prominent location',
    website: 'must prominently post its notice on the web site',
  },
} as const

/**
 * WHAT GOOGLE SAYS MOVES A LOCAL RANKING — the patient-growth guide's source.
 *
 * That guide was written in September with a figure or a comparison in most
 * paragraphs and a source for none of them ("most new patients pick from
 * those three tiles", "100+ Google reviews", "converts multiples better").
 * The library's content law is "no invented statistics", so on 2026-11-26
 * each was sourced, softened or cut. What could be sourced is here: Google's
 * own help page on local ranking, read as served, each line word for word and
 * pinned in `tests/marketing/sourced-guides.test.tsx`.
 */
export const LOCAL_RANKING = {
  source: {
    label: 'Google Business Profile Help, “Tips to improve your local ranking on Google”',
    url: 'https://support.google.com/business/answer/7091',
    readOn: '2026-11-26',
  } satisfies GuideSource,
  says: {
    verify:
      'This tells Google that you’re authorized to represent the business, so it\'s more likely to show up in search results.',
    complete: 'Businesses with complete and accurate info are more likely to show up in local search results.',
    reviews: 'More reviews and positive ratings can help your business’s local ranking.',
    replies: 'Positive reviews and helpful replies can help your business stand out.',
    noPaying: 'There\'s no way to request or pay for a better local ranking on Google.',
  },
} as const

/**
 * WHEN A PAYMENT PLAN IN WRITING BECOMES "CREDIT" — 12 CFR 1026.2(a)(17), the
 * past-due letters guide's one outside rule.
 *
 * ONE SENTENCE, QUOTED, AND NOT EXPLAINED. The rule goes on to say what
 * "regularly" means and to carve out cases; whether it reaches a given
 * practice is a lawyer's answer. The guide gives the sentence that raises the
 * question beside the payment-plan letter and stops. Read at Cornell's Legal
 * Information Institute and labelled so.
 */
export const INSTALLMENT_RULE = {
  source: {
    label:
      'the federal lending rule’s definition of a creditor, 12 CFR 1026.2(a)(17), as published by Cornell’s Legal Information Institute',
    url: 'https://www.law.cornell.edu/cfr/text/12/1026.2',
    readOn: '2026-11-26',
  } satisfies GuideSource,
  says: {
    creditor:
      'A person who regularly extends consumer credit that is subject to a finance charge or is payable by written agreement in more than four installments (not including a down payment)',
  },
} as const

/**
 * WHAT THE TREATMENT FOLLOW-UP GUIDE QUOTES — four pages, each for one thing.
 *
 *  - The ADA's code of conduct, for WHY a practice follows up at all: the
 *    patient is owed what they need to decide, and the decision is theirs.
 *    One sentence of section 1.A, read on ada.org.
 *  - MouthHealthy, the ADA's site for patients, for the year-end benefits
 *    note. TWO sentences, and the second is the one the note is built on: the
 *    page itself says plans differ and tells the patient to check. So the
 *    template asks ("if your dental plan runs on the calendar year") and
 *    never tells.
 *  - Open Dental's manual and the Dentrix Enterprise blog, for WHERE THE LIST
 *    COMES FROM and who has benefits left: each vendor's own sentences about
 *    its own report. The guide names only the two systems whose own pages
 *    were read. The Dentrix post is from 2020 and the guide says so.
 *
 * Every string under `says` is word for word, pinned in
 * `tests/marketing/treatment-follow-up-guide.test.tsx`.
 */
export const TREATMENT_FOLLOWUP = {
  adaCode: {
    source: {
      label: 'the American Dental Association’s Code of Professional Conduct, section 1.A',
      url: 'https://www.ada.org/about/principles/code-of-ethics/patient-autonomy',
      readOn: '2026-11-26',
    } satisfies GuideSource,
    says: {
      involvement:
        'The dentist should inform the patient of the proposed treatment, and any reasonable alternatives, in a manner that allows the patient to become involved in treatment decisions.',
    },
  },
  benefits: {
    source: {
      label: 'MouthHealthy, “Use Dental Insurance Before the End of the Year”',
      url: 'https://www.mouthhealthy.org/dental-care/using-dental-benefits',
      readOn: '2026-11-26',
    } satisfies GuideSource,
    says: {
      deadline:
        'Many insurance companies have a benefit deadline of December 31, and this means that any of your unused benefits don’t roll over into the New Year for most dental plans.',
      varies:
        'Still, some plans may end at different times of the year, so check your plan document or ask your employer to be sure.',
    },
  },
  openDental: {
    source: {
      label: 'Open Dental’s manual, “Treatment Finder Report”',
      url: 'https://opendental.com/manual/reporttreatfinder.html',
      readOn: '2026-11-26',
    } satisfies GuideSource,
    says: {
      report: 'Use the Treatment Finder report to identify active patients who have treatment planned procedures.',
      remaining:
        'Enter an amount to filter the report to only include patients that have insurance benefits remaining over the specified amount.',
    },
  },
  dentrix: {
    source: {
      label: 'the Dentrix Enterprise blog, “Following Up On Your Unscheduled Treatment Plans”',
      url: 'https://blog.dentrixenterprise.com/following-up-on-your-unscheduled-treatment-plans/',
      readOn: '2026-11-26',
      pageSays: 'June 10, 2020',
    } satisfies GuideSource,
    says: {
      report:
        'Use the Unscheduled Treatment Plan Report to find and schedule treatment plans that have been added to the Chart but not scheduled in the Appointment Book.',
      remaining:
        'The report displays patient insurance benefits remaining, which you can use to find patients who still have insurance benefits available but have not yet scheduled an appointment for their treatment plans.',
    },
  },
} as const

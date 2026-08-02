/**
 * SMS REGISTRATION (Phase 5 limb 3, slice 2) — the pure half of the
 * provisioning state machine.
 *
 * WHAT THIS PROVISIONS. Every clinic gets its OWN A2P 10DLC brand (it is a
 * separate legal business — there is no version of this we can absorb), its
 * own campaign, and its own local number. A shared platform number is
 * shared-originator traffic the carriers prohibit, and one bad clinic on
 * shared infrastructure can silence every clinic
 * (docs/sms-provider-evaluation.md).
 *
 * WHAT THE CLINIC DOES: answers one form, once — EIN, entity type, and a
 * contact at their own domain. Everything after is the machine's job, per
 * the doctrine ("does this ask the clinic to operate something, or does it
 * do the job and report?"). There is no wizard, no checklist, no console.
 * The machine registers, polls, retries, and reports; the only times a
 * human at the clinic is needed again are the two the carriers themselves
 * impose, and the state machine names them honestly instead of hiding them.
 *
 * Why a pure module: which state follows which, who each state belongs to
 * (the clinic's problem vs ours), what the status card says, and when a
 * wait has become a stall are the parts worth pinning in tests — and none
 * of them need a database or an AWS credential. The service half
 * (lib/services/sms-registration.ts) owns the API calls; this owns the
 * judgement. The structural precedent is lib/services/custom-domain.ts:
 * collect input → call the external API → poll → surface pending/failed.
 */

/**
 * The machine's states, stored in `clinic_sms_config.a2p_status`.
 *
 *   none ─→ collecting ─→ brand_pending ─→ campaign_pending ─→
 *   number_pending ─→ approved
 *
 * with three off-ramps: `brand_action_needed` (the carriers want something
 * only the clinic can give — an email click, corrected business details),
 * `rejected` (a terminal no that needs changed inputs to retry), and
 * `suspended` (the provider pulled something out from under an approved
 * setup — ours to fix, never the clinic's).
 */
export const SMS_REGISTRATION_STATES = [
  /** Nothing started. The integration card shows its quiet default. */
  'none',
  /** The clinic saved details but they haven't been submitted — either
   *  validation found gaps or the submit itself is in flight. */
  'collecting',
  /** Brand submitted; the Campaign Registry + carriers are reviewing.
   *  Published expectation: days, not minutes. */
  'brand_pending',
  /** The carriers (or AWS) need something ONLY THE CLINIC can provide:
   *  the brand-contact's email-verification click (REQUIRES_AUTHENTICATION)
   *  or corrected business details (REQUIRES_UPDATES). The one state whose
   *  next move belongs to the practice. */
  'brand_action_needed',
  /** Brand approved; the campaign (our authored use case) is under review.
   *  Published worst case: up to FOUR WEEKS. The status copy says so out
   *  loud — a spinner implying minutes would be a lie. */
  'campaign_pending',
  /** Campaign approved; the number is purchased and being associated —
   *  AWS publishes ~up to 14 days for the association to complete. */
  'number_pending',
  /** Live. The send path unlocks on exactly this value and no other. */
  'approved',
  /** A terminal no. Carries a reason in lastErrorMeta; retrying means
   *  changing the inputs, not asking the same question again. */
  'rejected',
  /** The provider suspended something after approval. Sending is blocked
   *  and this is OURS to chase — telling the clinic would hand them alarm
   *  with no lever (the Guardian's own law). */
  'suspended',
] as const

export type SmsRegistrationState = (typeof SMS_REGISTRATION_STATES)[number]

export function isSmsRegistrationState(v: unknown): v is SmsRegistrationState {
  return typeof v === 'string' && (SMS_REGISTRATION_STATES as readonly string[]).includes(v)
}

/** The states where the machine is waiting on an external review and the
 *  polling cron has something to poll. */
export const POLLING_STATES: readonly SmsRegistrationState[] = [
  'brand_pending',
  'brand_action_needed', // the email click resolves provider-side; poll it
  'campaign_pending',
  'number_pending',
]

/** The Campaign Registry's entity vocabulary. `sole_proprietorship` is real
 *  but second-class with the carriers (lower throughput, extra scrutiny) —
 *  the UI copy says so rather than letting a solo dentist discover it. */
export const SMS_ENTITY_TYPES = [
  { value: 'llc', label: 'LLC' },
  { value: 'corporation', label: 'Corporation' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'sole_proprietorship', label: 'Sole proprietorship' },
  { value: 'non_profit', label: 'Non-profit' },
] as const

export type SmsEntityType = (typeof SMS_ENTITY_TYPES)[number]['value']

export function isSmsEntityType(v: unknown): v is SmsEntityType {
  return typeof v === 'string' && SMS_ENTITY_TYPES.some((t) => t.value === v)
}

/** EIN → nine digits, or null when it can't be one. The carriers verify the
 *  EIN against the legal name, and a typo here is the #1 cause of brand
 *  rejection — so the one shape check we CAN do happens at the door. */
export function normalizeEin(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length !== 9) return null
  // 00- is not an issued EIN prefix; all-same-digit strings are keyboard
  // mashes, not tax ids.
  if (digits.startsWith('00')) return null
  if (/^(\d)\1{8}$/.test(digits)) return null
  return digits
}

/** How an EIN is shown back to staff: XX-XXXXXXX. */
export function formatEin(raw: string | null | undefined): string {
  const ein = normalizeEin(raw)
  return ein ? `${ein.slice(0, 2)}-${ein.slice(2)}` : ''
}

/** Free-mail domains the carriers look sideways at for a BRAND contact.
 *  Warned about, not blocked: plenty of real single-chair practices run on
 *  a gmail address, and being stricter than the carrier would strand them.
 *  If the carriers reject it, that lands as brand_action_needed with an
 *  honest reason — the same place any other correction lands. */
const FREEMAIL_DOMAINS = new Set([
  'gmail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'aol.com',
  'icloud.com',
  'me.com',
  'msn.com',
  'live.com',
  'protonmail.com',
  'proton.me',
])

export interface BrandDetailsInput {
  ein: string
  entityType: string
  brandContactName: string
  brandContactEmail: string
}

export interface BrandDetailsIssue {
  field: keyof BrandDetailsInput
  message: string
}

export interface ValidatedBrandDetails {
  ein: string
  entityType: SmsEntityType
  brandContactName: string
  brandContactEmail: string
  /** True when the contact is on a free-mail domain — surfaced as a heads-up
   *  ("carriers sometimes push back on this"), never a block. */
  freemailContact: boolean
}

/**
 * Validate the one form the clinic fills in. Returns every issue at once —
 * a form that reveals its complaints one at a time is a form filled in four
 * times.
 *
 * `platformDomains` are OUR domains: the AWS ISV rule is that the brand
 * contact represents the actual brand, so an address at the platform's
 * domain is structurally wrong and is the one email rule we hard-enforce.
 */
export function validateBrandDetails(
  input: BrandDetailsInput,
  platformDomains: readonly string[] = ['dreamcreatestudio.com', 'dreamcreateweb.com'],
): { ok: true; value: ValidatedBrandDetails } | { ok: false; issues: BrandDetailsIssue[] } {
  const issues: BrandDetailsIssue[] = []

  const ein = normalizeEin(input.ein)
  if (!ein) {
    issues.push({
      field: 'ein',
      message: 'That doesn’t look like an EIN — it’s the nine-digit number on your IRS letter, like 12-3456789.',
    })
  }

  if (!isSmsEntityType(input.entityType)) {
    issues.push({ field: 'entityType', message: 'Pick your business type.' })
  }

  const name = input.brandContactName.trim()
  if (name.length < 2) {
    issues.push({ field: 'brandContactName', message: 'Who should the carriers contact? A real person’s name.' })
  }

  const email = input.brandContactEmail.trim().toLowerCase()
  const emailDomain = email.split('@')[1] ?? ''
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    issues.push({ field: 'brandContactEmail', message: 'That email doesn’t look complete.' })
  } else if (platformDomains.some((d) => emailDomain === d.toLowerCase())) {
    // The ISV rule, hard-enforced: the contact must represent the CLINIC.
    issues.push({
      field: 'brandContactEmail',
      message: 'This needs to be an email at your practice, not ours — the carriers verify the business owns it.',
    })
  }

  if (issues.length > 0) return { ok: false, issues }
  return {
    ok: true,
    value: {
      ein: ein as string,
      entityType: input.entityType as SmsEntityType,
      brandContactName: name,
      brandContactEmail: email,
      freemailContact: FREEMAIL_DOMAINS.has(emailDomain),
    },
  }
}

/**
 * Map a provider registration status onto our state, given which STEP the
 * registration is (brand or campaign). One home for the mapping so the poll
 * loop and the tests can never disagree about what REVIEWING means.
 *
 * AWS's vocabulary (SMS V2 `RegistrationStatus`): CREATED, SUBMITTED,
 * AWS_REVIEWING, REVIEWING, REQUIRES_AUTHENTICATION, REQUIRES_UPDATES,
 * PROVISIONING, COMPLETE, CLOSED, DELETED.
 */
export function mapProviderStatus(
  step: 'brand' | 'campaign',
  providerStatus: string,
): SmsRegistrationState | null {
  const s = providerStatus.toUpperCase()
  switch (s) {
    case 'CREATED':
      // Exists but not submitted — the machine's own to-do, not a review.
      return 'collecting'
    case 'SUBMITTED':
    case 'AWS_REVIEWING':
    case 'REVIEWING':
    case 'PROVISIONING':
      return step === 'brand' ? 'brand_pending' : 'campaign_pending'
    case 'REQUIRES_AUTHENTICATION':
      // The brand contact must click the verification email — genuinely the
      // clinic's move, on either step (in practice it is a brand-step state).
      return 'brand_action_needed'
    case 'REQUIRES_UPDATES':
      // The carriers want corrected inputs. For the BRAND those inputs are
      // the clinic's own business details; for the CAMPAIGN they are the use
      // case WE authored, which is ours to fix — the clinic never even saw
      // it. The service routes campaign updates to the platform.
      return step === 'brand' ? 'brand_action_needed' : 'campaign_pending'
    case 'COMPLETE':
      // The step finished — the CALLER advances the machine (brand complete
      // → register campaign; campaign complete → buy the number). Mapping it
      // to a state here would skip the advance.
      return null
    case 'CLOSED':
    case 'DELETED':
      return 'rejected'
    default:
      // An unknown provider status must never invent progress. Hold the
      // current state; the sweep's stall clock keeps ticking underneath.
      return null
  }
}

/**
 * Whose move is it? The Guardian's audience law, applied here: a finding
 * goes to the party that holds the lever.
 *
 *  - 'clinic'   → they can act: click the email, fix their details.
 *  - 'platform' → ours: a suspension, or a review that has sat beyond its
 *                 published window. Telling the practice would hand them
 *                 alarm with no lever.
 *  - null       → nobody's move; the machine is simply working or done.
 */
export function registrationAudience(state: SmsRegistrationState): 'clinic' | 'platform' | null {
  switch (state) {
    case 'brand_action_needed':
    case 'rejected':
      return 'clinic'
    case 'suspended':
      return 'platform'
    default:
      return null
  }
}

/**
 * When has a wait become a STALL — something the Guardian should show Dream
 * Create? Thresholds sit beyond each step's PUBLISHED worst case, so a
 * finding means "slower than the carriers themselves said", never "slower
 * than we'd like." Days, deliberately generous: a false alarm here trains
 * the owner to ignore the list, which is how a guardian gets ignored.
 */
export const STALL_DAYS: Partial<Record<SmsRegistrationState, number>> = {
  brand_pending: 7, // published: 1–2 business days
  brand_action_needed: 14, // the clinic's click — nudge-worthy after two weeks
  campaign_pending: 35, // published: up to 4 weeks
  number_pending: 21, // published: ~14 days
}

export function isRegistrationStalled(
  state: SmsRegistrationState,
  stateUpdatedAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  const days = STALL_DAYS[state]
  if (days == null || !stateUpdatedAt) return false
  return now.getTime() - stateUpdatedAt.getTime() > days * 24 * 60 * 60 * 1000
}

/**
 * What the status card says, per state — the honest sentence, with the
 * published timescale named when there is one. A spinner that implies
 * minutes over a review the carriers say takes weeks is a lie the clinic
 * discovers on its own schedule.
 */
export function describeRegistrationState(state: SmsRegistrationState): string {
  switch (state) {
    case 'none':
      return 'Not set up yet.'
    case 'collecting':
      return 'Getting your details ready to submit.'
    case 'brand_pending':
      return 'Your business is being verified with the carriers — this usually takes a few days.'
    case 'brand_action_needed':
      return 'The carriers need one thing from you — check the notice below.'
    case 'campaign_pending':
      return 'Your business is verified. The carriers are reviewing how you’ll use texting — this is the slow part, and can take a few weeks. Nothing is needed from you.'
    case 'number_pending':
      return 'Nearly there — your practice’s own number is being connected. This can take up to two weeks.'
    case 'approved':
      return 'Texting is live from your practice’s own number.'
    case 'rejected':
      return 'The carriers turned this application down — the details below say why, and fixing them re-applies.'
    case 'suspended':
      return 'Texting is paused while we sort something out with the carrier on our side. Nothing is needed from you.'
  }
}

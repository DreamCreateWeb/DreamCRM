import 'server-only'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import {
  POLLING_STATES,
  isSmsRegistrationState,
  mapProviderStatus,
  isRegistrationStalled,
  describeRegistrationState,
  validateBrandDetails,
  registrationAudience,
  type SmsRegistrationState,
  type BrandDetailsInput,
  type BrandDetailsIssue,
} from '@/lib/sms-registration'

/**
 * SMS REGISTRATION (Phase 5 limb 3, slice 2b) — the machine's hands.
 *
 * The pure half (lib/sms-registration.ts) owns the judgement; this owns the
 * AWS End User Messaging calls and the row. Structural precedent:
 * lib/services/custom-domain.ts — collect input → call the external API →
 * poll → surface pending/failed, with a cron driving the polls.
 *
 * DARK BUILD: everything gates on `smsDriver()`. With SMS_DRIVER unset the
 * cron no-ops, the UI keeps its coming-soon posture, and nothing changes in
 * prod until the env var is set (the same way domain buying shipped dark).
 *
 * Credentials are AMBIENT — the App Runner instance role in prod, env/SSO
 * locally. No client in this repo ever passes a `credentials` key; granting
 * the new API is an inline policy on DreamCRMAppRunnerInstanceRole
 * (sms-voice:*Registration*, sms-voice:RequestPhoneNumber,
 * sms-voice:DescribePhoneNumbers), the docs/custom-domains.md convention.
 */

const AWS_REGION = process.env.AWS_REGION || 'us-east-1'

/** The house driver switch (emailDriver / customDomainDriver precedent).
 *  'none' is the dark-build state, not an error. */
export function smsDriver(): 'aws' | 'none' {
  return process.env.SMS_DRIVER === 'aws' ? 'aws' : 'none'
}

/** Lazy client, the custom-domain idiom: null when the driver is off, the
 *  SDK never loads on the dark path, commands lazily imported per call. */
async function smsClient(): Promise<
  import('@aws-sdk/client-pinpoint-sms-voice-v2').PinpointSMSVoiceV2Client | null
> {
  if (smsDriver() !== 'aws') return null
  const { PinpointSMSVoiceV2Client } = await import('@aws-sdk/client-pinpoint-sms-voice-v2')
  return new PinpointSMSVoiceV2Client({ region: AWS_REGION })
}

/**
 * AWS registration-type ids and the field paths for the 10DLC forms.
 *
 * The FORMS are defined server-side by AWS (DescribeRegistrationTypeDefinitions
 * serves the schema at runtime) — these constants mirror the documented
 * 10DLC brand/campaign forms. If AWS refuses a field the registration lands
 * in REQUIRES_UPDATES, which the state machine already models honestly as
 * brand_action_needed / a platform fix — a wrong path here degrades to a
 * visible state, never a silent one. Verified against the live API when the
 * driver is first enabled (it cannot be integration-tested from CI).
 */
const BRAND_REGISTRATION_TYPE = 'US_TEN_DLC_BRAND_REGISTRATION'
const CAMPAIGN_REGISTRATION_TYPE = 'US_TEN_DLC_CAMPAIGN_REGISTRATION'

/**
 * OUR authored campaign use case — the clinic never sees or edits this,
 * which is exactly why a campaign REQUIRES_UPDATES is OUR problem, never
 * theirs (the audience law in the pure half). One home so every clinic's
 * campaign tells the carriers the same true story.
 */
export const CAMPAIGN_USE_CASE = {
  useCase: 'MIXED',
  description:
    'Appointment reminders, appointment confirmations, and occasional recall/reactivation messages from a dental practice to its own patients. Patients opt in via the practice’s booking and intake forms; marketing messages additionally require a written-consent checkbox. STOP/HELP honored.',
  sampleMessage1:
    'Bright Smiles Dental: Hi Sam, a reminder about your cleaning tomorrow (Tue) at 10:00 AM. Reply C to confirm or call us to reschedule. Reply STOP to opt out.',
  sampleMessage2:
    'Bright Smiles Dental: Hi Sam, it’s been a while since your last cleaning — if you’d like to come in, booking takes about a minute: {link}. Reply STOP to opt out.',
} as const

export interface SmsRegistrationView {
  state: SmsRegistrationState
  /** The honest sentence for the status card (pure half's copy). */
  statusText: string
  /** Whose move it is: 'clinic' | 'platform' | null. */
  audience: 'clinic' | 'platform' | null
  /** E.164, once live. */
  phoneNumber: string | null
  /** What the carriers/provider said, when the clinic can act on it. Never
   *  raw vendor errors for states that aren't theirs to fix. */
  notice: string | null
  updatedAt: Date | null
  /** Echo of the saved details, for the form's re-render after a reject. */
  details: { ein: string | null; entityType: string | null; brandContactName: string | null; brandContactEmail: string | null }
}

/** The status read the detail page renders. Missing row = state 'none'. */
export async function getSmsRegistration(organizationId: string): Promise<SmsRegistrationView> {
  const [row] = await db
    .select()
    .from(schema.clinicSmsConfig)
    .where(eq(schema.clinicSmsConfig.organizationId, organizationId))
    .limit(1)
  const state: SmsRegistrationState = isSmsRegistrationState(row?.a2pStatus) ? row.a2pStatus : 'none'
  const audience = registrationAudience(state)
  // The provider's words reach the clinic ONLY when the state is theirs to
  // act on — a suspended clinic gets "we're on it", not an AWS error code.
  const meta = (row?.lastErrorMeta ?? null) as { message?: string } | null
  const notice = audience === 'clinic' && meta?.message ? String(meta.message) : null
  return {
    state,
    statusText: describeRegistrationState(state),
    audience,
    phoneNumber: row?.smsPhoneNumber ?? null,
    notice,
    updatedAt: row?.a2pStatusUpdatedAt ?? null,
    details: {
      ein: row?.ein ?? null,
      entityType: row?.entityType ?? null,
      brandContactName: row?.brandContactName ?? null,
      brandContactEmail: row?.brandContactEmail ?? null,
    },
  }
}

export type StartResult =
  | { ok: true; state: SmsRegistrationState }
  | { ok: false; issues?: BrandDetailsIssue[]; error?: string }

/**
 * The clinic's ONE form, submitted. Validates, saves, registers the brand,
 * submits it — state → brand_pending. Everything after is the cron's job.
 *
 * Never throws raw provider errors at the form: an AWS failure keeps the
 * row at 'collecting' with the details SAVED (they don't retype anything),
 * stores the diagnostics, and answers in the voice.
 */
export async function startSmsRegistration(
  organizationId: string,
  input: BrandDetailsInput,
): Promise<StartResult> {
  if (smsDriver() !== 'aws') {
    return { ok: false, error: 'Texting isn’t switched on for this platform yet.' }
  }
  // The demo org never networks — the law every integration follows.
  const [org] = await db
    .select({ isDemo: schema.organization.isDemo })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .limit(1)
  if (org?.isDemo) {
    return { ok: false, error: 'The demo practice can’t register a real phone number.' }
  }

  const validated = validateBrandDetails(input)
  if (!validated.ok) return { ok: false, issues: validated.issues }
  const v = validated.value

  // Brand registration needs the clinic's legal identity — already collected
  // on the Business profile. Refusing HERE with a pointer beats submitting a
  // half-blank form the carriers will bounce in a week.
  const [profile] = await db
    .select({
      legalName: schema.clinicProfile.legalName,
      displayName: schema.clinicProfile.displayName,
      addressLine1: schema.clinicProfile.addressLine1,
      city: schema.clinicProfile.city,
      state: schema.clinicProfile.state,
      postalCode: schema.clinicProfile.postalCode,
      phone: schema.clinicProfile.phone,
      websiteDomain: schema.clinicProfile.websiteDomain,
    })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .limit(1)
  const [orgRow] = await db
    .select({ slug: schema.organization.slug })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .limit(1)
  const siteUrl = orgRow?.slug ? `https://${orgRow.slug}.dreamcreatestudio.com` : null
  const legalName = profile?.legalName?.trim() || profile?.displayName?.trim()
  if (!legalName || !profile?.addressLine1 || !profile?.city || !profile?.state || !profile?.postalCode) {
    return {
      ok: false,
      error:
        'The carriers need your practice’s legal name and full address first — add them under Settings → Business profile, then come back.',
    }
  }

  const now = new Date()
  // Save the details FIRST, durable, whatever the provider does next.
  await db
    .insert(schema.clinicSmsConfig)
    .values({
      organizationId,
      ein: v.ein,
      entityType: v.entityType,
      brandContactName: v.brandContactName,
      brandContactEmail: v.brandContactEmail,
      a2pStatus: 'collecting',
      a2pStatusUpdatedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.clinicSmsConfig.organizationId,
      set: {
        ein: v.ein,
        entityType: v.entityType,
        brandContactName: v.brandContactName,
        brandContactEmail: v.brandContactEmail,
        a2pStatus: 'collecting',
        a2pStatusUpdatedAt: now,
        updatedAt: now,
      },
    })

  try {
    const client = await smsClient()
    if (!client) return { ok: false, error: 'Texting isn’t switched on for this platform yet.' }
    const {
      CreateRegistrationCommand,
      PutRegistrationFieldValueCommand,
      SubmitRegistrationVersionCommand,
    } = await import('@aws-sdk/client-pinpoint-sms-voice-v2')

    // Deterministic ClientToken: a retry after a half-failure resumes the
    // SAME registration instead of minting a second brand for the clinic
    // (the content calendar's payload.done lesson, applied provider-side).
    const created = await client.send(
      new CreateRegistrationCommand({
        RegistrationType: BRAND_REGISTRATION_TYPE,
        ClientToken: `dcrm-brand-${organizationId}`.slice(0, 64),
      }),
    )
    const registrationId = created.RegistrationId
    if (!registrationId) throw new Error('Provider returned no registration id')

    // The brand form. Field paths mirror the documented 10DLC brand form;
    // a refused field lands in REQUIRES_UPDATES → brand_action_needed, the
    // honest catch-all (see the FIELD MAP note at the top).
    const fields: Record<string, string> = {
      'companyInfo.legalCompanyName': legalName,
      'companyInfo.dbaBrandName': profile.displayName?.trim() || legalName,
      'companyInfo.taxIdEin': v.ein,
      'companyInfo.entityType': v.entityType.toUpperCase(),
      // The clinic's public site: their custom domain when they have one,
      // else their subdomain on the platform — either is a real, resolving
      // URL the carriers can visit.
      'companyInfo.website': profile.websiteDomain
        ? `https://${profile.websiteDomain}`
        : siteUrl ?? '',
      'companyInfo.vertical': 'HEALTHCARE',
      'contactInfo.address1': profile.addressLine1,
      'contactInfo.city': profile.city,
      'contactInfo.state': profile.state,
      'contactInfo.zipCode': profile.postalCode,
      'contactInfo.country': 'US',
      'contactInfo.supportPhoneNumber': profile.phone?.trim() || '',
      'contactInfo.firstName': v.brandContactName.split(/\s+/)[0] ?? v.brandContactName,
      'contactInfo.lastName': v.brandContactName.split(/\s+/).slice(1).join(' ') || v.brandContactName,
      'contactInfo.supportEmail': v.brandContactEmail,
    }
    for (const [path, value] of Object.entries(fields)) {
      if (!value) continue // optional blanks stay unset, never empty strings
      await client.send(
        new PutRegistrationFieldValueCommand({
          RegistrationId: registrationId,
          FieldPath: path,
          TextValue: value,
        }),
      )
    }
    await client.send(new SubmitRegistrationVersionCommand({ RegistrationId: registrationId }))

    await db
      .update(schema.clinicSmsConfig)
      .set({
        brandRegistrationId: registrationId,
        a2pStatus: 'brand_pending',
        a2pStatusUpdatedAt: new Date(),
        lastErrorMeta: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.clinicSmsConfig.organizationId, organizationId))
    return { ok: true, state: 'brand_pending' }
  } catch (e) {
    console.error('[sms-registration] brand submit failed', e)
    await db
      .update(schema.clinicSmsConfig)
      .set({
        lastErrorMeta: { code: (e as { name?: string }).name ?? 'error', message: (e as Error).message },
        updatedAt: new Date(),
      })
      .where(eq(schema.clinicSmsConfig.organizationId, organizationId))
      .catch(() => undefined)
    return {
      ok: false,
      error: 'Your details are saved, but the submission didn’t go through on our side — try again in a minute.',
    }
  }
}

export interface SmsRegistrationRunResult {
  skipped?: 'driver_off'
  polled: number
  advanced: number
  /** Waits past their published worst case — PLATFORM-actionable, surfaced
   *  in the heartbeat, never written into a clinic's ledger (a slow carrier
   *  review is not a broken engine of theirs). */
  stalled: Array<{ organizationId: string; state: string }>
  errors: Array<{ organizationId: string; error: string }>
}

/**
 * The cron's sweep: poll every registration in flight, advance the machine
 * on each step's COMPLETE. Best-effort per org — one clinic's provider
 * hiccup never blocks the sweep.
 */
export async function pollSmsRegistrations(now: Date = new Date()): Promise<SmsRegistrationRunResult> {
  const result: SmsRegistrationRunResult = { polled: 0, advanced: 0, stalled: [], errors: [] }
  if (smsDriver() !== 'aws') return { ...result, skipped: 'driver_off' }

  const rows = await db
    .select({
      config: schema.clinicSmsConfig,
      isDemo: schema.organization.isDemo,
    })
    .from(schema.clinicSmsConfig)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.clinicSmsConfig.organizationId))

  const inFlight = rows.filter(
    (r) =>
      !r.isDemo &&
      isSmsRegistrationState(r.config.a2pStatus) &&
      (POLLING_STATES as readonly string[]).includes(r.config.a2pStatus),
  )

  for (const { config } of inFlight) {
    result.polled++
    try {
      const advanced = await pollOne(config, now)
      if (advanced) result.advanced++
      const state = config.a2pStatus as SmsRegistrationState
      if (!advanced && isRegistrationStalled(state, config.a2pStatusUpdatedAt, now)) {
        result.stalled.push({ organizationId: config.organizationId, state })
      }
    } catch (e) {
      result.errors.push({ organizationId: config.organizationId, error: (e as Error).message })
      await db
        .update(schema.clinicSmsConfig)
        .set({
          lastErrorMeta: { code: (e as { name?: string }).name ?? 'error', message: (e as Error).message },
          updatedAt: new Date(),
        })
        .where(eq(schema.clinicSmsConfig.organizationId, config.organizationId))
        .catch(() => undefined)
    }
  }

  await recordHeartbeat(result, now)
  return result
}

type ConfigRow = typeof schema.clinicSmsConfig.$inferSelect

/** Move ONE clinic's machine forward. Returns true when the state changed. */
async function pollOne(config: ConfigRow, now: Date): Promise<boolean> {
  const client = await smsClient()
  if (!client) return false
  const state = config.a2pStatus as SmsRegistrationState

  if (state === 'brand_pending' || state === 'brand_action_needed') {
    if (!config.brandRegistrationId) return false
    const status = await registrationStatus(client, config.brandRegistrationId)
    if (status === 'COMPLETE') {
      await registerCampaign(client, config)
      await setState(config.organizationId, 'campaign_pending', now, { clearError: true })
      return true
    }
    return applyMapped('brand', status, config, now)
  }

  if (state === 'campaign_pending') {
    if (!config.campaignRegistrationId) {
      // A death between brand COMPLETE and campaign create — resume the
      // advance rather than waiting forever on an id that never comes.
      await registerCampaign(client, config)
      return false
    }
    const status = await registrationStatus(client, config.campaignRegistrationId)
    if (status === 'COMPLETE') {
      await buyNumber(client, config, now)
      return true
    }
    return applyMapped('campaign', status, config, now)
  }

  if (state === 'number_pending') {
    if (!config.providerPhoneNumberId) return false
    const { DescribePhoneNumbersCommand } = await import('@aws-sdk/client-pinpoint-sms-voice-v2')
    const res = await client.send(
      new DescribePhoneNumbersCommand({ PhoneNumberIds: [config.providerPhoneNumberId] }),
    )
    const number = res.PhoneNumbers?.[0]
    if (number?.Status === 'ACTIVE') {
      await db
        .update(schema.clinicSmsConfig)
        .set({
          smsPhoneNumber: number.PhoneNumber ?? config.smsPhoneNumber,
          a2pStatus: 'approved',
          a2pStatusUpdatedAt: now,
          lastErrorMeta: null,
          updatedAt: now,
        })
        .where(eq(schema.clinicSmsConfig.organizationId, config.organizationId))
      return true
    }
    return false // PENDING / ASSOCIATING — still working
  }

  return false
}

/** The registration's CURRENT provider status. */
async function registrationStatus(
  client: NonNullable<Awaited<ReturnType<typeof smsClient>>>,
  registrationId: string,
): Promise<string> {
  const { DescribeRegistrationsCommand } = await import('@aws-sdk/client-pinpoint-sms-voice-v2')
  const res = await client.send(new DescribeRegistrationsCommand({ RegistrationIds: [registrationId] }))
  return res.Registrations?.[0]?.RegistrationStatus ?? ''
}

/** Map + write, stamping the state clock ONLY on a real change so the stall
 *  clock measures time-in-state, not time-since-last-poll. */
async function applyMapped(
  step: 'brand' | 'campaign',
  providerStatus: string,
  config: ConfigRow,
  now: Date,
): Promise<boolean> {
  const mapped = mapProviderStatus(step, providerStatus)
  if (!mapped || mapped === config.a2pStatus) return false
  await setState(config.organizationId, mapped, now, { clearError: mapped !== 'rejected' })
  return true
}

async function setState(
  organizationId: string,
  state: SmsRegistrationState,
  now: Date,
  opts: { clearError?: boolean } = {},
): Promise<void> {
  await db
    .update(schema.clinicSmsConfig)
    .set({
      a2pStatus: state,
      a2pStatusUpdatedAt: now,
      ...(opts.clearError ? { lastErrorMeta: null } : {}),
      updatedAt: now,
    })
    .where(eq(schema.clinicSmsConfig.organizationId, organizationId))
}

/** Brand approved → register OUR authored campaign for this clinic. */
async function registerCampaign(
  client: NonNullable<Awaited<ReturnType<typeof smsClient>>>,
  config: ConfigRow,
): Promise<void> {
  const {
    CreateRegistrationCommand,
    PutRegistrationFieldValueCommand,
    CreateRegistrationAssociationCommand,
    SubmitRegistrationVersionCommand,
  } = await import('@aws-sdk/client-pinpoint-sms-voice-v2')

  const created = await client.send(
    new CreateRegistrationCommand({
      RegistrationType: CAMPAIGN_REGISTRATION_TYPE,
      ClientToken: `dcrm-campaign-${config.organizationId}`.slice(0, 64),
    }),
  )
  const registrationId = created.RegistrationId
  if (!registrationId) throw new Error('Provider returned no campaign registration id')

  // Tie the campaign to the clinic's approved brand.
  if (config.brandRegistrationId) {
    await client
      .send(
        new CreateRegistrationAssociationCommand({
          RegistrationId: registrationId,
          ResourceId: config.brandRegistrationId,
        }),
      )
      .catch(() => undefined) // some forms take the brand as a field instead
  }

  const fields: Record<string, string> = {
    'campaignInfo.brandRegistrationId': config.brandRegistrationId ?? '',
    'campaignInfo.useCase': CAMPAIGN_USE_CASE.useCase,
    'campaignInfo.description': CAMPAIGN_USE_CASE.description,
    'campaignInfo.sampleMessage1': CAMPAIGN_USE_CASE.sampleMessage1,
    'campaignInfo.sampleMessage2': CAMPAIGN_USE_CASE.sampleMessage2,
    'campaignInfo.optInDescription':
      'Patients opt in on the practice’s own booking and intake forms; marketing messages require an additional never-pre-ticked written-consent checkbox. STOP/HELP keywords honored on every message.',
  }
  for (const [path, value] of Object.entries(fields)) {
    if (!value) continue
    await client.send(
      new PutRegistrationFieldValueCommand({ RegistrationId: registrationId, FieldPath: path, TextValue: value }),
    )
  }
  await client.send(new SubmitRegistrationVersionCommand({ RegistrationId: registrationId }))

  await db
    .update(schema.clinicSmsConfig)
    .set({ campaignRegistrationId: registrationId, updatedAt: new Date() })
    .where(eq(schema.clinicSmsConfig.organizationId, config.organizationId))
}

/** Campaign approved → buy the clinic its own 10DLC number, associated to
 *  the campaign at purchase. */
async function buyNumber(
  client: NonNullable<Awaited<ReturnType<typeof smsClient>>>,
  config: ConfigRow,
  now: Date,
): Promise<void> {
  const { RequestPhoneNumberCommand } = await import('@aws-sdk/client-pinpoint-sms-voice-v2')
  const res = await client.send(
    new RequestPhoneNumberCommand({
      IsoCountryCode: 'US',
      // TRANSACTIONAL: reminders dominate this number's traffic; marketing
      // consent is governed by the campaign registration + our own opt-in
      // gate, not by the number's message-type flag.
      MessageType: 'TRANSACTIONAL',
      NumberCapabilities: ['SMS'],
      NumberType: 'TEN_DLC',
      RegistrationId: config.campaignRegistrationId ?? undefined,
      // A clinic's number is its identity with patients — never casually
      // deletable. (NOTE, recorded honestly: the API offers no area-code
      // choice, so this is the clinic's OWN number but not necessarily in
      // their local area code. The status copy says "your practice's own
      // number" and no more.)
      DeletionProtectionEnabled: true,
      ClientToken: `dcrm-number-${config.organizationId}`.slice(0, 64),
    }),
  )
  await db
    .update(schema.clinicSmsConfig)
    .set({
      providerPhoneNumberId: res.PhoneNumberId ?? null,
      smsPhoneNumber: res.PhoneNumber ?? null,
      a2pStatus: 'number_pending',
      a2pStatusUpdatedAt: now,
      lastErrorMeta: null,
      updatedAt: now,
    })
    .where(eq(schema.clinicSmsConfig.organizationId, config.organizationId))
}

/** The platform heartbeat — own top-level key, passed whole, never fails
 *  the pass (the proposalEngine/guardian idiom). Stalls live HERE, for
 *  Dream Create's eyes: a slow carrier review is ours to chase. */
async function recordHeartbeat(result: SmsRegistrationRunResult, now: Date): Promise<void> {
  try {
    const { writePlatformConfig } = await import('@/lib/services/platform-config')
    await writePlatformConfig({
      smsRegistration: {
        ranAt: now.toISOString(),
        polled: result.polled,
        advanced: result.advanced,
        stalled: result.stalled.slice(0, 10),
        problems: Array.from(
          new Set(result.errors.map((e) => String(e.error).split(':')[0].trim())),
        ).slice(0, 5),
      },
    })
  } catch (e) {
    console.error('[sms-registration] heartbeat not recorded', e)
  }
}

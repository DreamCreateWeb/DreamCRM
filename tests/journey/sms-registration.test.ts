import { describe, it, expect } from 'vitest'
import {
  SMS_REGISTRATION_STATES,
  POLLING_STATES,
  isSmsRegistrationState,
  normalizeEin,
  formatEin,
  validateBrandDetails,
  mapProviderStatus,
  registrationAudience,
  isRegistrationStalled,
  describeRegistrationState,
  STALL_DAYS,
  type SmsRegistrationState,
} from '@/lib/sms-registration'

/**
 * SMS REGISTRATION (Phase 5 limb 3), pure half.
 *
 * The judgement calls — which state follows which provider status, whose
 * move each state is, when a wait has become a stall, and what the status
 * card says — are the parts worth pinning, and none of them need AWS.
 */

describe('the state vocabulary', () => {
  it('the send path unlocks on exactly one value', () => {
    // The whole compliance posture hangs on this: nothing sends until the
    // carriers said yes, and no intermediate state reads as yes.
    expect(SMS_REGISTRATION_STATES.filter((s) => s === 'approved')).toHaveLength(1)
  })

  it('every polling state is a real state', () => {
    for (const s of POLLING_STATES) expect(isSmsRegistrationState(s)).toBe(true)
  })

  it('terminal and idle states are not polled', () => {
    for (const s of ['none', 'approved', 'rejected', 'suspended'] as const) {
      expect(POLLING_STATES).not.toContain(s)
    }
  })
})

describe('normalizeEin', () => {
  it('accepts the spellings a person types', () => {
    expect(normalizeEin('12-3456789')).toBe('123456789')
    expect(normalizeEin('12 3456789')).toBe('123456789')
    expect(normalizeEin(' 123456789 ')).toBe('123456789')
  })

  it('rejects the wrong number of digits — the #1 cause of brand rejection is caught at the door', () => {
    expect(normalizeEin('1234567')).toBeNull()
    expect(normalizeEin('1234567890')).toBeNull()
    expect(normalizeEin('')).toBeNull()
    expect(normalizeEin(null)).toBeNull()
  })

  it('rejects keyboard mashes and impossible prefixes', () => {
    expect(normalizeEin('000000000')).toBeNull() // 00- is not issued
    expect(normalizeEin('111111111')).toBeNull() // all one digit
  })

  it('formats back the way the IRS letter shows it', () => {
    expect(formatEin('123456789')).toBe('12-3456789')
    expect(formatEin('nope')).toBe('')
  })
})

describe('validateBrandDetails', () => {
  const good = {
    ein: '12-3456789',
    entityType: 'llc',
    brandContactName: 'Dr. Ada Reyes',
    brandContactEmail: 'ada@brightsmiles.com',
  }

  it('passes a complete form and normalises what it accepts', () => {
    const r = validateBrandDetails(good)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.ein).toBe('123456789')
      expect(r.value.brandContactEmail).toBe('ada@brightsmiles.com')
      expect(r.value.freemailContact).toBe(false)
    }
  })

  it('returns EVERY issue at once — a form that complains one field at a time gets filled in four times', () => {
    const r = validateBrandDetails({
      ein: 'nope',
      entityType: 'club',
      brandContactName: '',
      brandContactEmail: 'not-an-email',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.issues.map((i) => i.field).sort()).toEqual([
        'brandContactEmail',
        'brandContactName',
        'ein',
        'entityType',
      ])
    }
  })

  it('HARD-BLOCKS a contact at the platform domain — the ISV rule: the contact represents the clinic, not us', () => {
    const r = validateBrandDetails({ ...good, brandContactEmail: 'support@dreamcreatestudio.com' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues[0].field).toBe('brandContactEmail')
  })

  it('WARNS on freemail, never blocks — being stricter than the carrier strands the solo dentist on gmail', () => {
    const r = validateBrandDetails({ ...good, brandContactEmail: 'drjones@gmail.com' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.freemailContact).toBe(true)
  })
})

describe('mapProviderStatus — one home for what REVIEWING means', () => {
  it('review-in-flight maps to the step’s pending state', () => {
    for (const s of ['SUBMITTED', 'AWS_REVIEWING', 'REVIEWING', 'PROVISIONING']) {
      expect(mapProviderStatus('brand', s)).toBe('brand_pending')
      expect(mapProviderStatus('campaign', s)).toBe('campaign_pending')
    }
  })

  it('REQUIRES_AUTHENTICATION is the clinic’s move — the email click no provider removes', () => {
    expect(mapProviderStatus('brand', 'REQUIRES_AUTHENTICATION')).toBe('brand_action_needed')
  })

  it('REQUIRES_UPDATES splits by WHO authored the inputs', () => {
    // Brand details are the clinic's own; the campaign use case is OURS —
    // the clinic never even saw it, so it must never become their problem.
    expect(mapProviderStatus('brand', 'REQUIRES_UPDATES')).toBe('brand_action_needed')
    expect(mapProviderStatus('campaign', 'REQUIRES_UPDATES')).toBe('campaign_pending')
  })

  it('COMPLETE maps to null — the CALLER advances the machine, a state here would skip the advance', () => {
    expect(mapProviderStatus('brand', 'COMPLETE')).toBeNull()
    expect(mapProviderStatus('campaign', 'COMPLETE')).toBeNull()
  })

  it('an UNKNOWN provider status never invents progress', () => {
    expect(mapProviderStatus('brand', 'SOME_FUTURE_STATUS')).toBeNull()
    expect(mapProviderStatus('campaign', '')).toBeNull()
  })

  it('CLOSED and DELETED are a terminal no', () => {
    expect(mapProviderStatus('brand', 'CLOSED')).toBe('rejected')
    expect(mapProviderStatus('campaign', 'DELETED')).toBe('rejected')
  })
})

describe('registrationAudience — whose move is it', () => {
  it('the clinic holds the lever on action-needed and rejected', () => {
    expect(registrationAudience('brand_action_needed')).toBe('clinic')
    expect(registrationAudience('rejected')).toBe('clinic')
  })

  it('a suspension is OURS — telling the practice hands them alarm with no lever', () => {
    expect(registrationAudience('suspended')).toBe('platform')
  })

  it('working and done are nobody’s move', () => {
    for (const s of ['none', 'collecting', 'brand_pending', 'campaign_pending', 'number_pending', 'approved'] as const) {
      expect(registrationAudience(s), s).toBeNull()
    }
  })
})

describe('the stall clock', () => {
  const DAY = 24 * 60 * 60 * 1000
  const NOW = new Date('2026-08-02T12:00:00Z')
  const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY)

  it('every threshold sits BEYOND the step’s published worst case — a stall means slower than the carriers said', () => {
    expect(STALL_DAYS.brand_pending).toBeGreaterThan(2) // published 1–2 days
    expect(STALL_DAYS.campaign_pending).toBeGreaterThan(28) // published up to 4 weeks
    expect(STALL_DAYS.number_pending).toBeGreaterThan(14) // published ~14 days
  })

  it('flags a wait past its threshold and not before', () => {
    expect(isRegistrationStalled('brand_pending', daysAgo(8), NOW)).toBe(true)
    expect(isRegistrationStalled('brand_pending', daysAgo(3), NOW)).toBe(false)
    expect(isRegistrationStalled('campaign_pending', daysAgo(36), NOW)).toBe(true)
    expect(isRegistrationStalled('campaign_pending', daysAgo(20), NOW)).toBe(false)
  })

  it('states with no clock never stall — approved is not "stalled at being done"', () => {
    for (const s of ['none', 'approved', 'rejected', 'suspended'] as const) {
      expect(isRegistrationStalled(s, daysAgo(400), NOW), s).toBe(false)
    }
  })

  it('a missing timestamp is no signal, not an infinite stall', () => {
    expect(isRegistrationStalled('brand_pending', null, NOW)).toBe(false)
  })
})

describe('what the status card says', () => {
  it('every state has a sentence, and none of them says "undefined"', () => {
    for (const s of SMS_REGISTRATION_STATES) {
      const text = describeRegistrationState(s as SmsRegistrationState)
      expect(text.length, s).toBeGreaterThan(10)
      expect(text).not.toContain('undefined')
    }
  })

  it('the SLOW review says weeks out loud — a spinner implying minutes is a lie', () => {
    expect(describeRegistrationState('campaign_pending')).toContain('weeks')
    expect(describeRegistrationState('campaign_pending').toLowerCase()).toContain('nothing is needed from you')
  })

  it('a suspension never asks the clinic for anything', () => {
    const text = describeRegistrationState('suspended').toLowerCase()
    expect(text).toContain('nothing is needed from you')
    expect(text).toContain('our side')
  })

  it('no state blames the practice or leaks vendor jargon', () => {
    for (const s of SMS_REGISTRATION_STATES) {
      const text = describeRegistrationState(s as SmsRegistrationState).toLowerCase()
      for (const word of ['aws', 'twilio', '10dlc', 'a2p', 'api', 'sid']) {
        // Whole words only — "our side" is not a Twilio SID leak.
        expect(new RegExp(`\\b${word}\\b`).test(text), `${s} leaks '${word}'`).toBe(false)
      }
    }
  })
})

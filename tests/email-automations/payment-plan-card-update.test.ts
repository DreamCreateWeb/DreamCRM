import { describe, it, expect, vi } from 'vitest'
import {
  EMAIL_AUTOMATION_SPECS,
  EMAIL_AUTOMATION_KEYS,
  EMAIL_SAMPLE_FIELDS,
  bodyOpensWithGreeting,
  normalizeEmailOverride,
  resolveEmailAutomations,
} from '@/lib/types/email-automations'

/**
 * THE `payment_plan_card_update` EMAIL — what a patient gets once when an
 * automatic payment-plan charge is declined. It joins the Emails hub registry
 * in the Billing group with its own on/off (default ON), fills {{amount}} +
 * the usual name/clinic tokens, and renders through the clinic sender like
 * `balance_pay_link` (the send site is pinned in tests/billing). The fixed
 * blocks — the retry day / the pause, the "Update my card" button — are the
 * service's, so the hub says so.
 */

vi.mock('@/lib/db', () => ({ db: {}, schema: {} }))

import { renderFromResolved } from '@/lib/services/email-automations'

const KEY = 'payment_plan_card_update' as const

describe('payment_plan_card_update registry entry', () => {
  const spec = EMAIL_AUTOMATION_SPECS[KEY]

  it('sits in the Billing group with its own toggle and the Collections door', () => {
    expect(EMAIL_AUTOMATION_KEYS).toContain(KEY)
    expect(spec.category).toBe('billing')
    expect(spec.enableSource).toBe('email_automations')
    expect(spec.moduleHref).toBe('/payments/collections')
    // authEmailShell adds no greeting of its own — the default body greets.
    expect(spec.greets).toBeUndefined()
    expect(bodyOpensWithGreeting(spec.slotDefaults.body)).toBe(true)
  })

  it('offers the amount token and names the fixed blocks staff cannot edit', () => {
    const tokens = spec.tokens.map((t) => t.token)
    expect(tokens).toEqual(expect.arrayContaining(['{{firstName}}', '{{clinicName}}', '{{clinicPhone}}', '{{amount}}']))
    expect(spec.slotFields.map((f) => f.slot)).toEqual(['subject', 'body'])
    expect(spec.includesNote.join(' ')).toMatch(/Update my card/)
    expect(spec.includesNote.join(' ')).toMatch(/try again on|paused/)
    expect(spec.timingHint?.text).toMatch(/never twice/i)
  })

  it('the hub preview fills {{amount}} (and {{balance}}) with a sample', () => {
    // The sample list moved server-side with the real preview (ML-34).
    expect(EMAIL_SAMPLE_FIELDS.amount).toMatch(/^\$[\d.]+$/)
    expect(EMAIL_SAMPLE_FIELDS.balance).toMatch(/^\$[\d.]+$/)
  })
})

describe('payment_plan_card_update resolve + render', () => {
  const FIELDS = { firstName: 'Marcus', clinicName: 'Acme Dental', clinicPhone: '', amount: '$100.00' }

  it('defaults ON; a clinic can switch it off in the hub', () => {
    expect(resolveEmailAutomations(null)[KEY].enabled).toBe(true)
    expect(resolveEmailAutomations({ [KEY]: { enabled: false } })[KEY].enabled).toBe(false)
    expect(normalizeEmailOverride(KEY, { enabled: false })).toEqual({ enabled: false })
  })

  it('fills the default copy with the declined amount and no override', () => {
    const r = renderFromResolved(KEY, resolveEmailAutomations(null)[KEY], FIELDS)
    expect(r.enabled).toBe(true)
    expect(r.subject).toBe('Your $100.00 payment to Acme Dental didn’t go through')
    expect(r.full.body).toMatch(/^Hi Marcus — the \$100\.00 payment on your plan with Acme Dental didn’t go through\./)
    expect(r.full.body).toMatch(/no judgment/)
    expect(r.override).toEqual({})
  })

  it('a clinic-edited body renders with tokens applied', () => {
    const stored = { [KEY]: { body: 'Hey {{firstName}}, your {{amount}} card payment bounced — new card below?' } }
    const r = renderFromResolved(KEY, resolveEmailAutomations(stored)[KEY], FIELDS)
    expect(r.full.body).toBe('Hey Marcus, your $100.00 card payment bounced — new card below?')
    expect(r.override.body).toBe(r.full.body)
  })
})

describe("membership_card_update registry entry", () => {
  const spec = EMAIL_AUTOMATION_SPECS["membership_card_update"]
  it("sits in the Billing group with the plan token and the Memberships door", () => {
    expect(EMAIL_AUTOMATION_KEYS).toContain("membership_card_update")
    expect(spec.category).toBe("billing")
    expect(spec.moduleHref).toBe("/payments/memberships")
    expect(spec.tokens.map((t) => t.token)).toContain("{{planName}}")
    expect(bodyOpensWithGreeting(spec.slotDefaults.body)).toBe(true)
    expect(spec.includesNote.join(" ")).toMatch(/Update your card/)
  })
})

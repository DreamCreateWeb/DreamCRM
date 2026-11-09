import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { portalVisitLabel } from '@/lib/portal-visit-label'
import { portalInsuranceNote, portalInsurancePlans } from '@/lib/portal-insurance-note'
import { resolveVisitTypes } from '@/lib/types/visit-types'

const read = (p: string) => readFileSync(p, 'utf8')

describe('portalVisitLabel — the clinic names its own visits', () => {
  const types = resolveVisitTypes([
    { id: 'implant_consult', label: 'Implant consult', durationMinutes: 45, bookablePublic: true, bookablePortal: true, depositCents: 0, prepInstructions: '' },
  ])
  it('reads a custom clinic-defined type', () => {
    expect(portalVisitLabel(types, 'implant_consult')).toBe('Implant consult')
  })
  it('says Visit only for an unknown id, a blank id, or the other escape hatch', () => {
    expect(portalVisitLabel(types, 'zzz')).toBe('Visit')
    expect(portalVisitLabel(types, null)).toBe('Visit')
    expect(portalVisitLabel(types, 'other')).toBe('Visit')
  })
  it('no portal page labels a visit from the built-in table any more', () => {
    for (const f of [
      'app/(portal)/patient/records/page.tsx',
      'app/(portal)/patient/appointments/page.tsx',
      'app/(portal)/patient/appointments/[id]/page.tsx',
      'app/(portal)/patient/appointments/[id]/ics/route.ts',
      'app/(portal)/patient/portal-data.ts',
    ]) {
      expect(read(f), f).not.toMatch(/PORTAL_VISIT_LABELS\[[^\]]+\]\s*\?\?\s*'Visit'/)
    }
  })
})

describe('portalInsuranceNote — verified means verified', () => {
  const tz = 'America/Chicago'
  const active = { status: 'active' as const, checkedAtIso: '2026-11-03T02:30:00Z', planName: 'Delta PPO', payerName: 'Delta Dental' }
  it('says nothing when the insurance tool is off', () => {
    expect(portalInsuranceNote({ toolOn: false, check: active, timeZone: tz })).toBeNull()
  })
  it('keeps the promise only while no recognised check exists', () => {
    expect(portalInsuranceNote({ toolOn: true, check: null, timeZone: tz })?.text).toMatch(/verify your coverage/)
    expect(portalInsuranceNote({ toolOn: true, check: { ...active, status: 'not_found' }, timeZone: tz })?.tone).toBe('pending')
  })
  it('names the verification, the clinic-tz date and the plan', () => {
    // 02:30Z on Nov 3 is still Nov 2 in Chicago
    const n = portalInsuranceNote({ toolOn: true, check: active, timeZone: tz })!
    expect(n.tone).toBe('verified')
    expect(n.text).toBe('Verified Nov 2, 2026 · Delta PPO')
  })
  it('never calls an inactive card verified', () => {
    const n = portalInsuranceNote({ toolOn: true, check: { ...active, status: 'inactive' }, timeZone: tz })!
    expect(n.text).not.toMatch(/^Verified/)
    expect(n.tone).toBe('attention')
  })
})

describe('the portal makes no promise the practice did not state', () => {
  it('no "within a business day" reply window in the portal', () => {
    for (const f of [
      'app/(portal)/patient/messages/messages-view.tsx',
      'app/(portal)/patient/book/page.tsx',
      'app/(portal)/patient/book/request-form.tsx',
      'components/patient-portal/family-link-request.tsx',
    ]) {
      expect(read(f), f).not.toMatch(/business day/)
    }
  })
  it('the family link request is offered only while Messages is on', () => {
    const src = read('app/(portal)/patient/family/page.tsx')
    expect(src.split('<FamilyLinkRequest').length - 1).toBe(2)
    expect(src.split('settings.features.messages &&').length - 1).toBe(2)
    expect(read('app/(portal)/patient/profile/page.tsx')).toMatch(/features\.family && settings\.features\.messages/)
  })
})

describe('portalInsurancePlans - both plans, each with its own last-verified line (ML-50)', () => {
  const tz = 'America/Chicago'
  const card = { carrier: 'Delta Dental', memberId: 'DD-1', groupNumber: null }
  const second = { carrier: 'Cigna', memberId: 'CG-2', groupNumber: 'G' }
  const active = { status: 'active' as const, checkedAtIso: '2026-11-03T02:30:00Z', planName: 'Delta PPO', payerName: 'Delta Dental' }
  const activeSecond = { status: 'active' as const, checkedAtIso: '2026-11-05T18:00:00Z', planName: 'Cigna DPPO', payerName: 'Cigna' }

  it('one plan: no Primary/Secondary words, the same note the single card always had', () => {
    const [p, ...rest] = portalInsurancePlans({ toolOn: true, primary: card, primaryCheck: active, secondary: null, secondaryCheck: null, timeZone: tz })
    expect(rest).toHaveLength(0)
    expect(p.heading).toBeNull()
    expect(p.note?.text).toBe('Verified Nov 2, 2026 · Delta PPO')
  })

  it('two plans: each is headed and dated from ITS OWN check', () => {
    const plans = portalInsurancePlans({ toolOn: true, primary: card, primaryCheck: active, secondary: second, secondaryCheck: activeSecond, timeZone: tz })
    expect(plans.map((x) => x.heading)).toEqual(['Primary plan', 'Secondary plan'])
    expect(plans[0].note?.text).toBe('Verified Nov 2, 2026 · Delta PPO')
    expect(plans[1].note?.text).toBe('Verified Nov 5, 2026 · Cigna DPPO')
    expect(plans[1].carrier).toBe('Cigna')
  })

  it('a verified primary never makes an unchecked secondary look verified', () => {
    const plans = portalInsurancePlans({ toolOn: true, primary: card, primaryCheck: active, secondary: second, secondaryCheck: null, timeZone: tz })
    expect(plans[0].note?.tone).toBe('verified')
    expect(plans[1].note?.tone).toBe('pending')
  })

  it('the practice switch off: no verifying copy on either plan', () => {
    const plans = portalInsurancePlans({ toolOn: false, primary: card, primaryCheck: active, secondary: second, secondaryCheck: activeSecond, timeZone: tz })
    expect(plans.every((x) => x.note === null)).toBe(true)
  })
})

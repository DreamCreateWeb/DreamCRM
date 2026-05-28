import { describe, it, expect } from 'vitest'
import {
  PMS_PROVIDERS,
  PROVIDER_LABELS,
  OPEN_DENTAL_FIELD_MAP,
  SYNCED_ENTITIES,
  NEVER_TOUCHED,
  pmsProvider,
  type PmsProviderId,
} from '@/lib/types/pms'

describe('PMS provider catalog', () => {
  it('wires exactly one provider as live (Open Dental)', () => {
    const live = PMS_PROVIDERS.filter((p) => p.availability === 'live')
    expect(live).toHaveLength(1)
    expect(live[0].id).toBe('open_dental')
  })

  it('shows the others honestly (request_access or roadmap, never live)', () => {
    for (const p of PMS_PROVIDERS) {
      if (p.id === 'open_dental') continue
      expect(['request_access', 'roadmap']).toContain(p.availability)
      expect(p.blurb.length).toBeGreaterThan(0)
      expect(p.connection.length).toBeGreaterThan(0)
    }
  })

  it('Dentrix Ascend is request_access; desktop/Eaglesoft/Curve are roadmap', () => {
    expect(pmsProvider('dentrix_ascend')?.availability).toBe('request_access')
    expect(pmsProvider('dentrix_desktop')?.availability).toBe('roadmap')
    expect(pmsProvider('eaglesoft')?.availability).toBe('roadmap')
    expect(pmsProvider('curve')?.availability).toBe('roadmap')
  })

  it('labels every provider id incl. the demo sandbox', () => {
    const ids: PmsProviderId[] = ['open_dental', 'dentrix_ascend', 'dentrix_desktop', 'eaglesoft', 'curve', 'demo']
    for (const id of ids) expect(PROVIDER_LABELS[id]).toBeTruthy()
    expect(PROVIDER_LABELS.demo.toLowerCase()).toContain('sandbox')
  })
})

describe('Open Dental field map (transparent fixed mapping)', () => {
  it('covers patient, appointment, provider', () => {
    expect(OPEN_DENTAL_FIELD_MAP.map((m) => m.entity).sort()).toEqual(['appointment', 'patient', 'provider'])
  })

  it('patients + appointments are two-way; providers are import-only', () => {
    const byEntity = Object.fromEntries(OPEN_DENTAL_FIELD_MAP.map((m) => [m.entity, m.direction]))
    expect(byEntity.patient).toBe('two_way')
    expect(byEntity.appointment).toBe('two_way')
    expect(byEntity.provider).toBe('import')
  })

  it('maps the PMS link key + the read-only balance', () => {
    const patient = OPEN_DENTAL_FIELD_MAP.find((m) => m.entity === 'patient')!
    expect(patient.fields.some((f) => f.pms === 'PatNum')).toBe(true)
    const balance = patient.fields.find((f) => f.crm.includes('pms_balance_cents'))
    expect(balance).toBeTruthy()
    expect(balance!.note?.toLowerCase()).toContain('read-only')
  })

  it('every mapping has a pms source and a crm target', () => {
    for (const em of OPEN_DENTAL_FIELD_MAP) {
      expect(em.fields.length).toBeGreaterThan(0)
      for (const f of em.fields) {
        expect(f.pms).toBeTruthy()
        expect(f.crm).toBeTruthy()
      }
    }
  })
})

describe('scope boundary (wrap, dont replace)', () => {
  it('syncs the relationship layer with valid icons', () => {
    expect(SYNCED_ENTITIES.length).toBe(4)
    const icons = new Set(['users', 'cal', 'badge', 'dollar'])
    for (const e of SYNCED_ENTITIES) expect(icons.has(e.icon)).toBe(true)
  })

  it('never touches clinical data', () => {
    const joined = NEVER_TOUCHED.join(' ').toLowerCase()
    expect(joined).toContain('chart')
    expect(joined).toContain('treatment plan')
    expect(joined).toContain('claim')
  })
})

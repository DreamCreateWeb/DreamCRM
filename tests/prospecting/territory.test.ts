import { describe, it, expect } from 'vitest'
import {
  territoryStage,
  rankTerritories,
  summarizeTerritories,
  TERRITORY_STAGE_LABELS,
} from '@/lib/prospect-territory'
import { resolveProspectingConfig } from '@/lib/types/prospecting'
import type { TerritoryRow } from '@/lib/types/prospecting'

function row(over: Partial<TerritoryRow> = {}): TerritoryRow {
  return {
    state: 'GA',
    stateName: 'Georgia',
    enabled: true,
    total: 100,
    enriched: 60,
    contacted: 20,
    callList: 3,
    won: 2,
    hot: 10,
    warm: 25,
    tasksPending: 0,
    imported: 100,
    workedPct: 60,
    convertPct: 10,
    ...over,
  }
}

describe('territoryStage', () => {
  it('walks idle → discovering → enriching → working → closing', () => {
    expect(territoryStage(row({ total: 0 }))).toBe('idle')
    expect(
      territoryStage(row({ total: 100, enriched: 30, contacted: 0, callList: 0, won: 0, tasksPending: 5 })),
    ).toBe('enriching')
    expect(
      territoryStage(row({ total: 100, enriched: 40, contacted: 0, callList: 0, won: 0, tasksPending: 0 })),
    ).toBe('discovering')
    expect(territoryStage(row({ contacted: 10, callList: 0, won: 0 }))).toBe('working')
    expect(territoryStage(row({ won: 1 }))).toBe('closing')
    expect(territoryStage(row({ won: 0, callList: 2 }))).toBe('closing')
    // every stage has a label
    for (const s of ['idle', 'discovering', 'enriching', 'working', 'closing'] as const) {
      expect(TERRITORY_STAGE_LABELS[s]).toBeTruthy()
    }
  })
})

describe('rankTerritories', () => {
  it('puts enabled first, then by total desc, then alpha', () => {
    const ranked = rankTerritories([
      row({ state: 'FL', enabled: false, total: 500 }),
      row({ state: 'GA', enabled: true, total: 100 }),
      row({ state: 'AL', enabled: true, total: 100 }),
      row({ state: 'TX', enabled: true, total: 300 }),
    ])
    expect(ranked.map((r) => r.state)).toEqual(['TX', 'AL', 'GA', 'FL'])
  })
})

describe('summarizeTerritories', () => {
  it('flags underworked big pools and still-discovering states', () => {
    const s = summarizeTerritories([
      row({ state: 'GA', enabled: true, total: 200, enriched: 40, workedPct: 20, tasksPending: 8 }),
      row({ state: 'FL', enabled: true, total: 30, enriched: 29, workedPct: 97, tasksPending: 0 }),
      row({ state: 'TX', enabled: false, total: 500, workedPct: 10 }), // disabled → not underworked
      row({ state: 'AL', enabled: true, total: 10, workedPct: 5 }), // too small → not underworked
    ])
    expect(s.enabledStates).toBe(3)
    expect(s.underworked.map((u) => u.state)).toEqual(['GA'])
    expect(s.stillDiscovering).toEqual(['GA'])
    expect(s.totalProspects).toBe(740)
  })

  it('suggests the enabled state with the most hot prospects, skipping the current focus', () => {
    const rows = [
      row({ state: 'GA', enabled: true, hot: 40 }),
      row({ state: 'FL', enabled: true, hot: 12 }),
      row({ state: 'TX', enabled: false, hot: 99 }), // disabled → ineligible
    ]
    expect(summarizeTerritories(rows).suggestedFocus?.state).toBe('GA')
    // when GA is already the focus, move to the next best
    expect(summarizeTerritories(rows, 'GA').suggestedFocus?.state).toBe('FL')
    // no hot anywhere → no suggestion
    expect(summarizeTerritories([row({ hot: 0 })]).suggestedFocus).toBeNull()
  })

  it('nudges to enable more when only a couple states are on', () => {
    expect(summarizeTerritories([row({ state: 'GA', enabled: true })]).enableMore).toBe(true)
    const many = ['GA', 'FL', 'TX', 'AL'].map((st) => row({ state: st, enabled: true }))
    expect(summarizeTerritories(many).enableMore).toBe(false)
  })
})

describe('config focus', () => {
  it('defaults to no focus and validates the state code', () => {
    expect(resolveProspectingConfig(null).focus).toEqual({ state: null })
    expect(resolveProspectingConfig({ focus: { state: 'GA' } }).focus.state).toBe('GA')
    expect(resolveProspectingConfig({ focus: { state: 'georgia' } }).focus.state).toBeNull()
    expect(resolveProspectingConfig({ focus: 'nope' }).focus.state).toBeNull()
  })
})

import { describe, it, expect } from 'vitest'
import { guardStringList, mentionsRemoval } from '@/lib/services/ai-website-edit'

/**
 * The AI command bar's list edit types (chips / carriers / payment methods)
 * REPLACE the whole list, so a model that returns FEWER items than current is
 * usually a forgotten-echo bug — silent data loss. `guardStringList` keeps the
 * union (current + genuine additions) UNLESS the owner actually asked to remove
 * something; `mentionsRemoval` decides that. These pure cases pin the guard.
 */

describe('mentionsRemoval', () => {
  it('detects explicit removal verbs', () => {
    for (const s of [
      'remove Aetna',
      'delete the parking FAQ',
      'drop Cigna',
      'clear the payment methods',
      'take out Delta Dental',
      'we no longer accept MetLife',
      'stop taking Apple Pay',
      "don't accept checks anymore",
    ]) {
      expect(mentionsRemoval(s), s).toBe(true)
    }
  })

  it('does NOT fire on pure additions / edits', () => {
    for (const s of [
      'we now take Apple Pay',
      'add Cigna to our carriers',
      'also accept HSA cards',
      'make the headline punchier',
    ]) {
      expect(mentionsRemoval(s), s).toBe(false)
    }
  })
})

describe('guardStringList — data-loss guard', () => {
  const current = ['Delta Dental', 'Cigna', 'Aetna']

  it('passes a same-or-longer list straight through (an add)', () => {
    const r = guardStringList(current, [...current, 'MetLife'], false, 40)
    expect(r.merged).toBe(false)
    expect(r.list).toEqual(['Delta Dental', 'Cigna', 'Aetna', 'MetLife'])
  })

  it('MERGES when the model returns fewer items with no removal intent (suspect)', () => {
    // Model forgot to echo Cigna + Aetna and only returned the new one.
    const r = guardStringList(current, ['MetLife'], false, 40)
    expect(r.merged).toBe(true)
    // Union preserves current order, appends the genuinely-new item.
    expect(r.list).toEqual(['Delta Dental', 'Cigna', 'Aetna', 'MetLife'])
  })

  it('does NOT merge a shorter list when the owner asked to remove', () => {
    const r = guardStringList(current, ['Delta Dental', 'Cigna'], true, 40)
    expect(r.merged).toBe(false)
    expect(r.list).toEqual(['Delta Dental', 'Cigna'])
  })

  it('de-dupes case-insensitively when merging', () => {
    const r = guardStringList(current, ['cigna'], false, 40)
    expect(r.merged).toBe(true)
    // "cigna" already present (case-insensitive) → no duplicate added.
    expect(r.list).toEqual(['Delta Dental', 'Cigna', 'Aetna'])
  })

  it('respects the cap', () => {
    const big = ['a', 'b', 'c', 'd', 'e']
    const r = guardStringList(big, ['a'], false, 3)
    expect(r.list).toHaveLength(3)
  })

  it('treats an empty current list as a normal replace (nothing to lose)', () => {
    const r = guardStringList([], ['Cash', 'Card'], false, 12)
    expect(r.merged).toBe(false)
    expect(r.list).toEqual(['Cash', 'Card'])
  })
})

import { describe, it, expect } from 'vitest'
import {
  avatarTint,
  daySeparatorLabel,
  groupMessagesByDay,
  messageInitials,
  type GroupableMessage,
} from '@/app/(double-sidebar)/messages/message-grouping'

// ── Avatars ──────────────────────────────────────────────────────────────

describe('messageInitials', () => {
  it('takes the first letter of first + last name', () => {
    expect(messageInitials('Mia', 'Nguyen')).toBe('MN')
  })

  it('strips a leading honorific so initials reflect the real name', () => {
    expect(messageInitials('Dr. Jane', 'Lee')).toBe('JL')
  })

  it('falls back to a single letter when there is no last name', () => {
    expect(messageInitials('Aiden', '')).toBe('A')
    expect(messageInitials('Aiden', null)).toBe('A')
  })

  it('uses a second word of a single name field ("Mary Jane" → "MJ")', () => {
    expect(messageInitials('Mary Jane', '')).toBe('MJ')
  })

  it('handles a full-name single argument (outbound sender label)', () => {
    expect(messageInitials('Dr. Reyes')).toBe('R')
    expect(messageInitials('Maria Vega')).toBe('MV')
  })

  it('returns "?" when nothing usable is supplied', () => {
    expect(messageInitials('', '')).toBe('?')
    expect(messageInitials(null, null)).toBe('?')
  })

  it('uppercases lowercase names', () => {
    expect(messageInitials('mia', 'nguyen')).toBe('MN')
  })
})

describe('avatarTint', () => {
  it('is stable: the same seed always returns the same tint', () => {
    expect(avatarTint('pat_1')).toEqual(avatarTint('pat_1'))
  })

  it('returns a paired bg + text class from the curated ramp', () => {
    const t = avatarTint('pat_42')
    expect(t.bg).toMatch(/^bg-/)
    expect(t.text).toMatch(/^text-/)
  })

  it('never returns a teal tint (teal is identity/selection, not a per-row tag)', () => {
    // Sample enough seeds to cover the whole ramp.
    for (let i = 0; i < 200; i++) {
      const t = avatarTint(`seed-${i}`)
      expect(t.bg).not.toMatch(/teal/)
      expect(t.text).not.toMatch(/teal/)
    }
  })

  it('distributes across more than one colour for differing seeds', () => {
    const bgs = new Set(Array.from({ length: 50 }, (_, i) => avatarTint(`p${i}`).bg))
    expect(bgs.size).toBeGreaterThan(1)
  })

  it('handles an empty seed without throwing', () => {
    expect(() => avatarTint('')).not.toThrow()
  })
})

// ── Day separators ───────────────────────────────────────────────────────

describe('daySeparatorLabel', () => {
  const now = new Date('2026-06-14T12:00:00')

  it('labels the current day "Today"', () => {
    expect(daySeparatorLabel(new Date('2026-06-14T09:00:00'), now)).toBe('Today')
  })

  it('labels the previous day "Yesterday"', () => {
    expect(daySeparatorLabel(new Date('2026-06-13T23:30:00'), now)).toBe('Yesterday')
  })

  it('labels an older same-year day as a short weekday + date', () => {
    expect(daySeparatorLabel(new Date('2026-06-11T10:00:00'), now)).toBe('Thu, Jun 11')
  })

  it('appends the year for a different calendar year', () => {
    expect(daySeparatorLabel(new Date('2025-12-30T10:00:00'), now)).toMatch(/2025/)
  })
})

// ── Message grouping ─────────────────────────────────────────────────────

function msg(over: Partial<GroupableMessage> & { id: string; sentAt: string }): GroupableMessage {
  return {
    direction: 'inbound',
    channel: 'in_app',
    sentByUserName: null,
    ...over,
  }
}

describe('groupMessagesByDay', () => {
  const now = new Date('2026-06-14T18:00:00')

  it('returns an empty array for no messages', () => {
    expect(groupMessagesByDay([], now)).toEqual([])
  })

  it('buckets messages into day groups with separator labels', () => {
    const days = groupMessagesByDay(
      [
        msg({ id: 'a', sentAt: '2026-06-13T10:00:00' }),
        msg({ id: 'b', sentAt: '2026-06-14T09:00:00' }),
      ],
      now,
    )
    expect(days).toHaveLength(2)
    expect(days[0].label).toBe('Yesterday')
    expect(days[1].label).toBe('Today')
  })

  it('groups consecutive inbound messages from the same patient into one group', () => {
    const days = groupMessagesByDay(
      [
        msg({ id: 'a', sentAt: '2026-06-14T09:00:00' }),
        msg({ id: 'b', sentAt: '2026-06-14T09:01:00' }),
        msg({ id: 'c', sentAt: '2026-06-14T09:02:00' }),
      ],
      now,
    )
    expect(days).toHaveLength(1)
    expect(days[0].groups).toHaveLength(1)
    expect(days[0].groups[0].messages.map((m) => m.id)).toEqual(['a', 'b', 'c'])
    expect(days[0].groups[0].direction).toBe('inbound')
  })

  it('breaks the group when the direction flips (inbound → outbound)', () => {
    const days = groupMessagesByDay(
      [
        msg({ id: 'a', direction: 'inbound', sentAt: '2026-06-14T09:00:00' }),
        msg({ id: 'b', direction: 'outbound', sentByUserName: 'Dr. Reyes', sentAt: '2026-06-14T09:05:00' }),
      ],
      now,
    )
    expect(days[0].groups).toHaveLength(2)
    expect(days[0].groups[0].direction).toBe('inbound')
    expect(days[0].groups[1].direction).toBe('outbound')
    // Outbound group carries the staff sender name.
    expect(days[0].groups[1].senderName).toBe('Dr. Reyes')
  })

  it('breaks the group when the outbound sender changes', () => {
    const days = groupMessagesByDay(
      [
        msg({ id: 'a', direction: 'outbound', sentByUserName: 'Dr. Reyes', sentAt: '2026-06-14T09:00:00' }),
        msg({ id: 'b', direction: 'outbound', sentByUserName: 'Maria Vega', sentAt: '2026-06-14T09:05:00' }),
      ],
      now,
    )
    expect(days[0].groups).toHaveLength(2)
  })

  it('breaks the group when the channel changes within a run', () => {
    const days = groupMessagesByDay(
      [
        msg({ id: 'a', direction: 'inbound', channel: 'in_app', sentAt: '2026-06-14T09:00:00' }),
        msg({ id: 'b', direction: 'inbound', channel: 'email', sentAt: '2026-06-14T09:05:00' }),
      ],
      now,
    )
    expect(days[0].groups).toHaveLength(2)
    expect(days[0].groups[0].channel).toBe('in_app')
    expect(days[0].groups[1].channel).toBe('email')
  })

  it('uses the first message id as the group key for React', () => {
    const days = groupMessagesByDay([msg({ id: 'first', sentAt: '2026-06-14T09:00:00' })], now)
    expect(days[0].groups[0].key).toBe('first')
  })
})

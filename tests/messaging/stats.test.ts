import { describe, it, expect } from 'vitest'
import { computeClientMessagingStats, type ClientConversation } from '@/lib/services/messages'

const NOW = new Date('2026-05-18T12:00:00Z')

function convo(overrides: Partial<ClientConversation> = {}): ClientConversation {
  return {
    id: overrides.id ?? 1,
    title: 'Convo',
    kind: 'client',
    clinicOrgId: 'org_x',
    clinicName: 'X Clinic',
    clinicSlug: 'x',
    counterpartName: 'Alice',
    counterpartRole: 'owner',
    lastMessage: 'hi',
    lastAt: new Date(NOW.getTime() - 60_000),
    unreadCount: 0,
    ...overrides,
  }
}

describe('computeClientMessagingStats', () => {
  it('returns all zeros for an empty list', () => {
    const s = computeClientMessagingStats([], { now: NOW })
    expect(s).toEqual({ activeConversations: 0, unreadMessages: 0, staleConversations: 0 })
  })

  it('counts total conversations regardless of unread state', () => {
    const s = computeClientMessagingStats(
      [convo({ id: 1, unreadCount: 0 }), convo({ id: 2, unreadCount: 3 })],
      { now: NOW },
    )
    expect(s.activeConversations).toBe(2)
  })

  it('sums unread across all conversations', () => {
    const s = computeClientMessagingStats(
      [convo({ id: 1, unreadCount: 2 }), convo({ id: 2, unreadCount: 5 }), convo({ id: 3, unreadCount: 0 })],
      { now: NOW },
    )
    expect(s.unreadMessages).toBe(7)
  })

  it('flags as stale only when unread AND no activity in >3 days', () => {
    const fourDaysAgo = new Date(NOW.getTime() - 4 * 24 * 60 * 60 * 1000)
    const oneHourAgo = new Date(NOW.getTime() - 60 * 60 * 1000)
    const s = computeClientMessagingStats(
      [
        convo({ id: 1, lastAt: fourDaysAgo, unreadCount: 3 }), // stale
        convo({ id: 2, lastAt: fourDaysAgo, unreadCount: 0 }), // old but caught up — not stale
        convo({ id: 3, lastAt: oneHourAgo, unreadCount: 5 }), // recent unread — not stale
      ],
      { now: NOW },
    )
    expect(s.staleConversations).toBe(1)
  })

  it("doesn't flag stale when lastAt is null", () => {
    const s = computeClientMessagingStats(
      [convo({ id: 1, lastAt: null, unreadCount: 2 })],
      { now: NOW },
    )
    expect(s.staleConversations).toBe(0)
  })

  it('respects a custom staleDays threshold', () => {
    const twoDaysAgo = new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000)
    const lenient = computeClientMessagingStats(
      [convo({ id: 1, lastAt: twoDaysAgo, unreadCount: 1 })],
      { now: NOW, staleDays: 3 },
    )
    const strict = computeClientMessagingStats(
      [convo({ id: 1, lastAt: twoDaysAgo, unreadCount: 1 })],
      { now: NOW, staleDays: 1 },
    )
    expect(lenient.staleConversations).toBe(0)
    expect(strict.staleConversations).toBe(1)
  })
})

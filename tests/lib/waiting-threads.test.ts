import { describe, it, expect } from 'vitest'
import { isWaitingThread, mergeMineAndUnclaimed } from '@/lib/waiting-threads'

const now = new Date('2026-06-10T12:00:00Z')
const t = (id: string, h: number) => ({ id, lastMessageAt: new Date(now.getTime() - h * 3_600_000) })

describe('isWaitingThread', () => {
  it('needs open + inbound last word + age', () => {
    const base = { status: 'open', lastMessageDirection: 'inbound', lastMessageAt: new Date(now.getTime() - 5 * 3_600_000) }
    expect(isWaitingThread(base, now, 4)).toBe(true)
    expect(isWaitingThread(base, now, 6)).toBe(false)
    expect(isWaitingThread({ ...base, lastMessageDirection: 'outbound' }, now)).toBe(false)
    expect(isWaitingThread({ ...base, status: 'archived' }, now)).toBe(false)
  })
})

describe('mergeMineAndUnclaimed', () => {
  it('keeps mine first, unclaimed newest-first, flags rows, dedupes, caps at 8', () => {
    const r = mergeMineAndUnclaimed([t('m1', 9)], [t('u1', 5), t('u2', 1), t('m1', 9)])
    expect(r.map((x) => [x.id, x.unclaimed])).toEqual([['m1', false], ['u2', true], ['u1', true]])
    const many = mergeMineAndUnclaimed(
      [t('a', 1), t('b', 2)],
      Array.from({ length: 10 }, (_, i) => t(`u${i}`, i)),
    )
    expect(many).toHaveLength(8)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Urgency triage — the keyword screen (English + Spanish clinical distress),
 * the AI confirm/stand-down, and the fail-open posture (a down classifier
 * keeps the keyword verdict; routine messages never cost an AI call).
 */

const state = {
  updates: [] as Array<Record<string, unknown>>,
}

vi.mock('@/lib/db', () => ({
  db: {
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          state.updates.push(values)
        },
      }),
    }),
  },
  schema: {
    patientThread: { id: 'id', organizationId: 'org' },
  },
}))
vi.mock('drizzle-orm', () => ({ and: vi.fn(() => ({})), eq: vi.fn(() => ({})) }))

const { runClaudeJsonMock, aiConfiguredMock } = vi.hoisted(() => ({
  runClaudeJsonMock: vi.fn(async () => ({ urgent: true, reason: 'severe pain, swollen jaw' })),
  aiConfiguredMock: vi.fn(() => true),
}))
vi.mock('@/lib/ai', () => ({ runClaudeJson: runClaudeJsonMock, aiConfigured: aiConfiguredMock }))

import { looksPossiblyUrgent, classifyInboundUrgency } from '@/lib/services/thread-triage'

beforeEach(() => {
  state.updates = []
  vi.clearAllMocks()
  aiConfiguredMock.mockReturnValue(true)
  runClaudeJsonMock.mockResolvedValue({ urgent: true, reason: 'severe pain, swollen jaw' })
})

describe('looksPossiblyUrgent', () => {
  it('catches English clinical distress', () => {
    expect(looksPossiblyUrgent('My tooth is killing me, the pain is unbearable')).toBe(true)
    expect(looksPossiblyUrgent('my crown fell off and it hurts')).toBe(true)
    expect(looksPossiblyUrgent('My son knocked out a tooth at practice!')).toBe(true)
  })

  it('catches Spanish clinical distress', () => {
    expect(looksPossiblyUrgent('Tengo mucho dolor y la cara hinchada')).toBe(true)
    expect(looksPossiblyUrgent('Se me cayó la corona')).toBe(true)
  })

  it('lets routine messages through quietly', () => {
    expect(looksPossiblyUrgent('Can I move my cleaning to next Tuesday?')).toBe(false)
    expect(looksPossiblyUrgent('Do you take Delta Dental?')).toBe(false)
  })
})

describe('classifyInboundUrgency', () => {
  it('routine message → no AI call, no update', async () => {
    await classifyInboundUrgency('org_1', 't1', 'Can I get a copy of my receipt?')
    expect(runClaudeJsonMock).not.toHaveBeenCalled()
    expect(state.updates).toHaveLength(0)
  })

  it('keyword candidate confirmed by AI → thread stamped with the crisp reason', async () => {
    await classifyInboundUrgency('org_1', 't1', 'My tooth broke and the pain is terrible')
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0]).toMatchObject({ urgency: 'urgent', urgencyReason: 'severe pain, swollen jaw' })
  })

  it('AI stands down an obvious false alarm → no stamp', async () => {
    runClaudeJsonMock.mockResolvedValueOnce({ urgent: false, reason: '' })
    await classifyInboundUrgency('org_1', 't1', 'Last visit it hurt a little but all good now — just rescheduling')
    expect(state.updates).toHaveLength(0)
  })

  it('AI failure → the keyword verdict stands (fail-open for a patient in pain)', async () => {
    runClaudeJsonMock.mockRejectedValueOnce(new Error('api down'))
    await classifyInboundUrgency('org_1', 't1', 'Terrible pain since last night')
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0]).toMatchObject({
      urgency: 'urgent',
      urgencyReason: 'Mentions pain or a possible dental emergency',
    })
  })

  it('AI unconfigured → keyword verdict stamps directly', async () => {
    aiConfiguredMock.mockReturnValue(false)
    await classifyInboundUrgency('org_1', 't1', 'mi hijo tiene dolor fuerte')
    expect(runClaudeJsonMock).not.toHaveBeenCalled()
    expect(state.updates).toHaveLength(1)
  })
})

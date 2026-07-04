import { describe, it, expect } from 'vitest'
import {
  COPILOT_ACTIONS,
  COPILOT_ACTION_KINDS,
  buildCopilotPrompt,
  parseCopilotResponse,
  renderCopilotSnapshot,
  type CopilotSnapshot,
} from '@/lib/prospect-copilot'

const SNAP: CopilotSnapshot = {
  engine: {
    killSwitch: false,
    dryRun: true,
    hunter: false,
    watchdogTripped: false,
    bookingEnabled: false,
    enabledStates: ['GA', 'FL'],
  },
  wiring: { senderConfigured: true, gmailConfigured: false, placesConfigured: true },
  funnel: { discovered: 500, enriched: 300, contacted: 120, engaged: 20, callList: 8, converted: 2 },
  bands: { hot: 40, warm: 90, cool: 120, low: 50 },
  last24h: { sent: 42, dryRun: 0, opens: 15, clicks: 4, replies: 3, newCallList: 2, autoEnrolled: 12 },
  nextAction: '3 practices raised a hand',
  callFirst: [{ name: 'Bright Smiles', state: 'GA', summary: 'Asked about pricing', phone: '404-555-1000' }],
  todaysDemos: [{ name: 'Cedar Dental', when: 'Fri 2:00 PM' }],
  brainCustomized: true,
  battleCards: 3,
}

describe('renderCopilotSnapshot', () => {
  it('renders the live engine + funnel + 24h facts the model reasons over', () => {
    const out = renderCopilotSnapshot(SNAP)
    expect(out).toContain('DRY-RUN')
    expect(out).toContain('GA, FL')
    expect(out).toContain('hot 40')
    expect(out).toContain('sent 42')
    expect(out).toContain('Bright Smiles')
    expect(out).toContain('Cedar Dental at Fri 2:00 PM')
    expect(out).toContain('owner-customized')
  })

  it('flags idle discovery + missing wiring honestly', () => {
    const out = renderCopilotSnapshot({
      ...SNAP,
      engine: { ...SNAP.engine, enabledStates: [] },
      wiring: { senderConfigured: false, gmailConfigured: false, placesConfigured: false },
    })
    expect(out).toContain('NONE (discovery idle)')
    expect(out).toContain('outreach sender configured: no')
  })
})

describe('buildCopilotPrompt', () => {
  it('embeds the snapshot + the allowed-action menu + the no-mutation guard', () => {
    const { system, user } = buildCopilotPrompt(SNAP, 'who should I call first?')
    expect(system).toContain('SNAPSHOT:')
    expect(system).toContain('Bright Smiles')
    expect(system).toContain('do NOT perform actions')
    // Every allowed kind is offered to the model.
    for (const k of COPILOT_ACTION_KINDS) expect(system).toContain(k)
    expect(user).toBe('who should I call first?')
  })

  it('clamps an over-long question', () => {
    const { user } = buildCopilotPrompt(SNAP, 'x'.repeat(5000))
    expect(user.length).toBe(2000)
  })
})

describe('parseCopilotResponse', () => {
  it('keeps a valid answer + fitting actions', () => {
    const res = parseCopilotResponse({
      answer: 'Bright Smiles in GA asked about pricing — call them first.',
      actions: [{ kind: 'open_call_list', label: 'Open the call list' }],
    })
    expect(res?.answer).toContain('Bright Smiles')
    expect(res?.actions).toEqual([{ kind: 'open_call_list', label: 'Open the call list' }])
  })

  it('drops unknown + duplicate action kinds and caps at 3', () => {
    const res = parseCopilotResponse({
      answer: 'ok',
      actions: [
        { kind: 'go_live' },
        { kind: 'nonsense' },
        { kind: 'go_live' }, // dup
        { kind: 'hunter_on' },
        { kind: 'open_settings' },
        { kind: 'open_prospects' }, // 4th valid — dropped by the cap
      ],
    })
    expect(res?.actions.map((a) => a.kind)).toEqual(['go_live', 'hunter_on', 'open_settings'])
  })

  it('falls back to the registry label when the model omits one', () => {
    const res = parseCopilotResponse({ answer: 'ok', actions: [{ kind: 'go_dry_run' }] })
    expect(res?.actions[0].label).toBe(COPILOT_ACTIONS.go_dry_run.label)
  })

  it('rejects an empty/absent answer', () => {
    expect(parseCopilotResponse({ answer: '   ', actions: [] })).toBeNull()
    expect(parseCopilotResponse(null)).toBeNull()
    expect(parseCopilotResponse({ actions: [] })).toBeNull()
  })

  it('every registry action is navigation-or-mutation with the right wiring', () => {
    for (const def of Object.values(COPILOT_ACTIONS)) {
      if (def.mutation) expect(def.href).toBeUndefined()
      else expect(def.href).toMatch(/^\/platform\/prospecting/)
    }
  })
})

import { describe, expect, it } from 'vitest'
import {
  CANNED_TEMPLATES,
  renderTemplate,
} from '@/lib/services/patient-messaging'

/**
 * Schema-level + helper-level tests for Patient Communications v1. The
 * full integration (DB writes, thread/message flow, aggregator) is
 * exercised via the demo seeder + manual demo verification — these
 * focus on the pure logic helpers so they stay honest as the surface
 * grows.
 */

describe('CANNED_TEMPLATES', () => {
  it('ships exactly 3 starter templates', () => {
    expect(CANNED_TEMPLATES).toHaveLength(3)
  })

  it('every template body uses the {{firstName}} variable', () => {
    for (const t of CANNED_TEMPLATES) {
      expect(t.body).toContain('{{firstName}}')
    }
  })

  it('templates cover the three primary use cases', () => {
    const keys = CANNED_TEMPLATES.map((t) => t.key)
    expect(keys).toContain('confirm_visit')
    expect(keys).toContain('treatment_followup')
    expect(keys).toContain('scheduling_question')
  })

  it('every template body is at least 50 characters of real copy', () => {
    for (const t of CANNED_TEMPLATES) {
      expect(t.body.length).toBeGreaterThan(50)
    }
  })

  it('no template body contains marketing-bro language', () => {
    for (const t of CANNED_TEMPLATES) {
      const lower = t.body.toLowerCase()
      expect(lower).not.toContain('!!!')
      expect(lower).not.toContain('leverage')
      expect(lower).not.toContain('synergy')
      expect(lower).not.toContain('game-changing')
      // Anti-shame voice: no demanding "you must"
      expect(lower).not.toContain('you must')
    }
  })
})

describe('renderTemplate', () => {
  it('substitutes {{firstName}}', () => {
    const out = renderTemplate('Hi {{firstName}}!', { firstName: 'Mia', lastName: 'Hayes' })
    expect(out).toBe('Hi Mia!')
  })

  it('substitutes {{lastName}}', () => {
    const out = renderTemplate('Welcome {{lastName}}', { firstName: 'Mia', lastName: 'Hayes' })
    expect(out).toBe('Welcome Hayes')
  })

  it('substitutes {{fullName}} as first + space + last', () => {
    const out = renderTemplate('Dear {{fullName}}', { firstName: 'Mia', lastName: 'Hayes' })
    expect(out).toBe('Dear Mia Hayes')
  })

  it('handles multiple substitutions in one body', () => {
    const out = renderTemplate(
      'Hi {{firstName}}, this is for {{lastName}} — full name {{fullName}}',
      { firstName: 'Aiden', lastName: 'Kim' },
    )
    expect(out).toBe('Hi Aiden, this is for Kim — full name Aiden Kim')
  })

  it('leaves unrecognized variables alone', () => {
    const out = renderTemplate('Hi {{firstName}}, your {{unknown}} is ready', { firstName: 'X', lastName: 'Y' })
    expect(out).toBe('Hi X, your {{unknown}} is ready')
  })

  it('handles a template with no variables (returns unchanged)', () => {
    const out = renderTemplate('No vars here', { firstName: 'X', lastName: 'Y' })
    expect(out).toBe('No vars here')
  })

  it('renders the actual canned templates without leaving placeholders', () => {
    for (const t of CANNED_TEMPLATES) {
      const rendered = renderTemplate(t.body, { firstName: 'Sophia', lastName: 'Iverson' })
      expect(rendered).toContain('Sophia')
      // {{firstName}} should be gone after rendering
      expect(rendered).not.toContain('{{firstName}}')
    }
  })
})

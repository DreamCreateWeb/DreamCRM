import { describe, it, expect } from 'vitest'
import { EMAIL_AUTOMATION_KEYS, EMAIL_AUTOMATION_SPECS, resolveEmailAutomations } from '@/lib/types/email-automations'

describe('shop order email registry entries (ML-42)', () => {
  for (const key of ['shop_ready_for_pickup', 'shop_shipped'] as const) {
    it(`${key}: in the Shop group, toggleable, every default token known`, () => {
      expect(EMAIL_AUTOMATION_KEYS).toContain(key)
      const spec = EMAIL_AUTOMATION_SPECS[key]
      expect(spec.category).toBe('shop')
      expect(spec.enableSource).toBe('email_automations')
      const known = new Set(spec.tokens.map((t) => t.token))
      const used = `${spec.slotDefaults.subject} ${spec.slotDefaults.body}`.match(/\{\{\w+\}\}/g) ?? []
      for (const t of used) expect(known.has(t), t).toBe(true)
      expect(resolveEmailAutomations(null)[key].enabled).toBe(true)
      expect(resolveEmailAutomations({ [key]: { enabled: false } })[key].enabled).toBe(false)
    })
  }
})

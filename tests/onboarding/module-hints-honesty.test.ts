import { describe, it, expect } from 'vitest'
import { MODULE_HINTS, ACTIVATION_TASK_DEFS } from '@/lib/types/onboarding'

/**
 * Orientation copy names only doors that exist. The Integrations hint sold
 * a self-serve Open Dental key for two months after the owner removed that
 * path (2026-08-19; the one PMS door is the NexHealth bridge, installed with
 * the practice), and the Shop hint + checklist card sold membership plans
 * from a hub they left on 2026-07-14 (Payments → Memberships).
 */
describe('module hints and checklist cards name real doors', () => {
  it('no hint sells the removed self-serve Open Dental path', () => {
    for (const [key, hint] of Object.entries(MODULE_HINTS)) {
      expect(`${hint.title} ${hint.body}`, key).not.toMatch(/Open Dental \(/)
      expect(`${hint.title} ${hint.body}`, key).not.toMatch(/through the official API/)
    }
    expect(MODULE_HINTS.integrations.body).toMatch(/NexHealth bridge/)
    expect(MODULE_HINTS.integrations.body).toMatch(/we connect it with you/)
  })

  it('the shop hint sells products, and points memberships at Payments', () => {
    expect(MODULE_HINTS.shop.body).not.toMatch(/membership plans from your website/)
    expect(MODULE_HINTS.shop.body).toMatch(/Membership plans live under Payments/)
  })

  it('the checklist’s PMS card is the S4 front door, in the bridge’s own words', () => {
    const pms = ACTIVATION_TASK_DEFS.find((t) => t.id === 'connect_pms')!
    expect(pms.href).toBe('/integrations/pms')
    expect(pms.label).not.toMatch(/Open Dental/)
    expect(pms.body).toMatch(/we connect it with you/)
  })

  it('the checklist’s shop card does not sell memberships from the shop', () => {
    const shop = ACTIVATION_TASK_DEFS.find((t) => t.id === 'open_shop')!
    expect(shop.body).not.toMatch(/membership plans, sold from your site/)
    expect(shop.body).toMatch(/Membership plans live under Payments/)
  })
})

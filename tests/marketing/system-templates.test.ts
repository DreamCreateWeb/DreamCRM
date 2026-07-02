import { describe, expect, it } from 'vitest'
import { SYSTEM_TEMPLATES } from '@/lib/services/marketing-templates'

/**
 * Phase A ships 3 system templates: Reactivation, Birthday, New-patient
 * welcome. Every new clinic gets them via seedSystemTemplates(), which is
 * idempotent at the (organization_id IS NULL, name) level. The actual
 * idempotency + insert behavior is integration-tested via the demo
 * seeder; these tests pin the surface area + the body-content invariants.
 */
describe('SYSTEM_TEMPLATES', () => {
  it('ships exactly 4 starter templates', () => {
    expect(SYSTEM_TEMPLATES).toHaveLength(4)
  })

  it('covers reactivation, birthday, welcome + the benefits (recall) template', () => {
    const categories = SYSTEM_TEMPLATES.map((t) => t.category).sort()
    expect(categories).toEqual(['birthday', 'reactivation', 'recall', 'welcome'])
  })

  it('each template has a non-empty subject + preview + bodyHtml', () => {
    for (const tpl of SYSTEM_TEMPLATES) {
      expect(tpl.name.length).toBeGreaterThan(0)
      expect(tpl.subject.length).toBeGreaterThan(0)
      expect(tpl.previewText.length).toBeGreaterThan(0)
      expect(tpl.bodyHtml.length).toBeGreaterThan(50)
      // Anti-shame voice spot-checks — bodies should warm-greet, not lecture
      expect(tpl.bodyHtml).toContain('{{firstName}}')
      // No marketing-bro vocabulary
      const lower = tpl.bodyHtml.toLowerCase()
      expect(lower).not.toContain('leverage')
      expect(lower).not.toContain('synergy')
      expect(lower).not.toContain('game-changing')
      expect(lower).not.toContain('!!!')
    }
  })

  it('each template suggests a default audience by slug', () => {
    const slugs = SYSTEM_TEMPLATES.map((t) => t.defaultAudienceSlug)
    expect(slugs).toContain('lapsed_180d')
    expect(slugs).toContain('birthday_month')
    expect(slugs).toContain('new_patient_60d')
  })

  it('the Reactivation body includes a clear "no judgment" anti-shame line', () => {
    const reactivation = SYSTEM_TEMPLATES.find((t) => t.category === 'reactivation')!
    expect(reactivation.bodyHtml).toMatch(/no judgment/i)
  })

  it('the New-patient welcome body covers expectations + emergency policy', () => {
    const welcome = SYSTEM_TEMPLATES.find((t) => t.category === 'welcome')!
    // Recall reminder (sets expectations)
    expect(welcome.bodyHtml.toLowerCase()).toMatch(/recall|reminder/)
    // Emergency policy
    expect(welcome.bodyHtml.toLowerCase()).toMatch(/emergenc/)
  })
})

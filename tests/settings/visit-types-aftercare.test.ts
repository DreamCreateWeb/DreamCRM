import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * THE VISIT-TYPE EDITOR's two after-the-visit fields (ML-28, Settings →
 * Practice → Visit types). A source pin, deliberately: the panel is a large
 * client component whose render needs the whole settings fixture; what this
 * slice adds is two inputs and their honest copy, and the copy is the
 * contract — "sent the evening of the visit, by email" is the promise the
 * post-visit-care lane keeps, and a blank is the switch.
 */

const SRC = readFileSync(resolve(__dirname, '../../app/(default)/settings/practice/practice-panel.tsx'), 'utf8')

describe('the aftercare field', () => {
  it('is a per-type textarea bound to aftercareInstructions, labelled per type', () => {
    expect(SRC).toContain('aria-label={`Aftercare for ${t.label}`}')
    expect(SRC).toContain('value={t.aftercareInstructions ?? \'\'}')
    expect(SRC).toContain("update(i, { aftercareInstructions: e.target.value.slice(0, 800) })")
  })

  it('says when and how it goes out, and that blank sends nothing — no texting copy', () => {
    expect(SRC).toContain('sent the evening of the visit, by email')
    expect(SRC).toContain('leave blank to send nothing')
    // The words a person reads — class names (`text-gray-500`) are not copy.
    const aftercareBlock = SRC.slice(SRC.indexOf('Aftercare <span'), SRC.indexOf('Check in the day after')).replace(/className="[^"]*"/g, '')
    expect(aftercareBlock).not.toMatch(/\btext(s|ing)?\b/i)
  })
})

describe('the day-after check-in flag', () => {
  it('is a per-type checkbox bound to checkInAfter that says a card is drafted for a yes', () => {
    expect(SRC).toContain('aria-label={`Check in the day after a ${t.label}`}')
    expect(SRC).toContain('checked={!!t.checkInAfter}')
    expect(SRC).toContain('update(i, { checkInAfter: e.target.checked })')
    expect(SRC).toContain('drafts a “How are you feeling?” email for your yes')
  })

  it('a freshly added type starts with no aftercare and no check-in', () => {
    expect(SRC).toContain("prepInstructions: '', aftercareInstructions: '', checkInAfter: false }")
  })
})

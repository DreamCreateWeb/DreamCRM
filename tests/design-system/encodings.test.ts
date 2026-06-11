import { describe, expect, it } from 'vitest'
import {
  AGING_LEGENDS,
  AGING_TIERS,
  APPOINTMENT_AGING_TIER,
  GLYPHS,
  TONE_PILL,
  TONE_TEXT,
  agingBorderClass,
  appointmentFlagGlyphs,
  leadAgingTier,
  messageRotTier,
  patientFlagGlyphs,
  type GlyphId,
  type Tone,
} from '@/lib/ui/encodings'

describe('tone recipes', () => {
  const tones: Tone[] = ['ok', 'warn', 'urgent', 'info', 'special', 'neutral']

  it('defines pill + text recipes with dark-mode variants for every tone', () => {
    for (const tone of tones) {
      expect(TONE_PILL[tone]).toContain('dark:')
      expect(TONE_TEXT[tone]).toContain('dark:')
    }
  })

  it('keeps one hue per meaning', () => {
    expect(TONE_PILL.ok).toContain('emerald')
    expect(TONE_PILL.warn).toContain('amber')
    expect(TONE_PILL.urgent).toContain('rose')
    // v2: info moved sky → indigo (teal/sky too close once the brand is teal).
    expect(TONE_PILL.info).toContain('indigo')
    expect(TONE_PILL.info).not.toContain('sky')
    expect(TONE_PILL.special).toContain('violet')
  })
})

describe('glyph registry', () => {
  it('every glyph has symbol, label, and an actions-first description', () => {
    for (const def of Object.values(GLYPHS)) {
      expect(def.symbol.length).toBeGreaterThan(0)
      expect(def.label.length).toBeGreaterThan(3)
      // Legend copy explains what to DO, so it should be a real sentence.
      expect(def.description.length).toBeGreaterThan(20)
    }
  })

  it('preserves the load-bearing aria-label strings', () => {
    expect(GLYPHS.newPatient.label).toBe('New patient')
    expect(GLYPHS.birthday.label).toBe('Birthday this week')
    expect(GLYPHS.balance.label).toBe('Outstanding balance')
    expect(GLYPHS.missingIntakeNext.label).toBe('Missing intake form before next visit')
    expect(GLYPHS.missingIntakeThis.label).toBe('Missing intake form before this visit')
    expect(GLYPHS.unconfirmed48h.label).toBe('Unconfirmed appointment in next 48h')
    expect(GLYPHS.lapsed.label).toBe('Lapsed — no visit in 9+ months')
    expect(GLYPHS.lapsedReturning.label).toBe('Lapsed patient returning — celebrate')
    expect(GLYPHS.optedOut.label).toBe('Opted out of marketing')
    expect(GLYPHS.bookedJustNow.label).toBe('Booked in the last hour')
    expect(GLYPHS.rescheduled.label).toBe('Rescheduled from an earlier slot')
    expect(GLYPHS.reminderSent.label).toBe('Reminder sent in the last 24h — avoid double-texting')
  })
})

describe('flag → glyph builders', () => {
  it('builds the patient cluster in canonical order', () => {
    const ids = patientFlagGlyphs({
      newPatient: true,
      birthdayThisWeek: true,
      hasOutstandingBalance: true,
      missingIntakeBeforeAppt: true,
      unconfirmedNext48h: true,
      lapsed: true,
      optedOut: true,
    })
    expect(ids).toEqual<GlyphId[]>([
      'newPatient',
      'birthday',
      'balance',
      'missingIntakeNext',
      'unconfirmed48h',
      'lapsed',
      'optedOut',
    ])
  })

  it('builds the appointment cluster in canonical order with appointment-scoped glyphs', () => {
    const ids = appointmentFlagGlyphs({
      newPatient: true,
      lapsedReturning: true,
      birthdayThisWeek: true,
      hasOutstandingBalance: true,
      missingIntakeBeforeAppt: true,
      unconfirmedNext48h: true,
      bookedJustNow: true,
      rescheduled: true,
      reminderSentRecently: true,
      optedOut: true,
    })
    expect(ids).toEqual<GlyphId[]>([
      'newPatient',
      'lapsedReturning',
      'birthday',
      'balance',
      'missingIntakeThis',
      'unconfirmed48h',
      'bookedJustNow',
      'rescheduled',
      'reminderSent',
      'optedOut',
    ])
  })

  it('returns empty for no flags', () => {
    expect(patientFlagGlyphs({})).toEqual([])
    expect(appointmentFlagGlyphs({})).toEqual([])
  })

  it('maps intake to the module-correct wording', () => {
    expect(patientFlagGlyphs({ missingIntakeBeforeAppt: true })).toEqual(['missingIntakeNext'])
    expect(appointmentFlagGlyphs({ missingIntakeBeforeAppt: true })).toEqual(['missingIntakeThis'])
  })
})

describe('aging tiers', () => {
  it('every tier has border + swatch classes', () => {
    for (const tier of Object.values(AGING_TIERS)) {
      expect(tier.borderClass).toContain('border-l-')
      expect(tier.swatchClass).toContain('bg-')
      expect(tier.label.length).toBeGreaterThan(2)
    }
  })

  it('agingBorderClass falls back to transparent', () => {
    expect(agingBorderClass(null)).toBe('border-l-transparent')
    expect(agingBorderClass('overdue')).toBe(AGING_TIERS.overdue.borderClass)
  })

  it('lead rot thresholds match the historical leads behavior', () => {
    expect(leadAgingTier(0.5)).toBe('fresh')
    expect(leadAgingTier(1)).toBe('fresh')
    expect(leadAgingTier(2)).toBe('quiet')
    expect(leadAgingTier(4)).toBe('quiet')
    expect(leadAgingTier(12)).toBe('aging')
    expect(leadAgingTier(24)).toBe('aging')
    expect(leadAgingTier(48)).toBe('late')
    expect(leadAgingTier(72)).toBe('late')
    expect(leadAgingTier(73)).toBe('overdue')
  })

  it('message rot thresholds match the unified-inbox behavior', () => {
    expect(messageRotTier(1)).toBe('fresh')
    expect(messageRotTier(3.9)).toBe('fresh')
    expect(messageRotTier(4)).toBe('aging')
    expect(messageRotTier(23.9)).toBe('aging')
    expect(messageRotTier(24)).toBe('overdue')
  })

  it('maps every appointment AgingLevel onto the shared vocabulary', () => {
    expect(APPOINTMENT_AGING_TIER.none).toBeNull()
    expect(APPOINTMENT_AGING_TIER.neutral).toBe('quiet')
    expect(APPOINTMENT_AGING_TIER.amber).toBe('aging')
    expect(APPOINTMENT_AGING_TIER.darkAmber).toBe('late')
    expect(APPOINTMENT_AGING_TIER.red).toBe('overdue')
  })
})

describe('aging legend presets', () => {
  it('every preset row points at a real tier and explains it', () => {
    for (const preset of Object.values(AGING_LEGENDS)) {
      expect(preset.title.length).toBeGreaterThan(20)
      for (const row of preset.rows) {
        expect(AGING_TIERS[row.tier]).toBeDefined()
        expect(row.meaning.length).toBeGreaterThan(5)
      }
    }
  })
})

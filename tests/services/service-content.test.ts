import { describe, it, expect } from 'vitest'
import { sanitizeServiceContent } from '@/lib/types/clinic-content'

/**
 * `sanitizeServiceContent` is the shared contract between the service-builder
 * editor and the `updateServiceContent` server action — it normalizes the four
 * editable sections (Highlights / Description / What to expect / Common
 * questions). These pin the trimming, empty-dropping, and length/count caps so a
 * hand-edit can't write a malformed blob the detail page chokes on.
 */
describe('sanitizeServiceContent', () => {
  it('trims fields and drops blank entries across every section', () => {
    const out = sanitizeServiceContent({
      heroBullets: ['  Gentle care  ', '', '   '],
      body: '  We keep you comfortable.  ',
      processSteps: [
        { title: '  Exam  ', body: '  We look first.  ' },
        { title: '', body: '' },
      ],
      faq: [
        { question: '  Does it hurt?  ', answer: '  Most people feel nothing.  ' },
        { question: '', answer: '' },
      ],
    })
    expect(out.heroBullets).toEqual(['Gentle care'])
    expect(out.body).toBe('We keep you comfortable.')
    expect(out.processSteps).toEqual([{ title: 'Exam', body: 'We look first.' }])
    expect(out.faq).toEqual([{ question: 'Does it hurt?', answer: 'Most people feel nothing.' }])
  })

  it('keeps a process step / FAQ when only one of its two fields is filled', () => {
    const out = sanitizeServiceContent({
      heroBullets: [],
      body: 'x',
      processSteps: [{ title: 'Just a title', body: '' }],
      faq: [{ question: '', answer: 'Just an answer' }],
    })
    expect(out.processSteps).toEqual([{ title: 'Just a title', body: '' }])
    expect(out.faq).toEqual([{ question: '', answer: 'Just an answer' }])
  })

  it('caps section counts (≤6 highlights, ≤8 steps, ≤10 FAQs)', () => {
    const out = sanitizeServiceContent({
      heroBullets: Array.from({ length: 10 }, (_, i) => `b${i}`),
      body: 'x',
      processSteps: Array.from({ length: 12 }, (_, i) => ({ title: `t${i}`, body: 'y' })),
      faq: Array.from({ length: 14 }, (_, i) => ({ question: `q${i}`, answer: 'a' })),
    })
    expect(out.heroBullets).toHaveLength(6)
    expect(out.processSteps).toHaveLength(8)
    expect(out.faq).toHaveLength(10)
  })

  it('caps per-field lengths (bullet 120, body 2000, step title 120 / body 800, FAQ q 240 / a 1200)', () => {
    const out = sanitizeServiceContent({
      heroBullets: ['x'.repeat(200)],
      body: 'y'.repeat(5000),
      processSteps: [{ title: 't'.repeat(200), body: 'b'.repeat(2000) }],
      faq: [{ question: 'q'.repeat(500), answer: 'a'.repeat(3000) }],
    })
    expect(out.heroBullets[0]).toHaveLength(120)
    expect(out.body).toHaveLength(2000)
    expect(out.processSteps[0].title).toHaveLength(120)
    expect(out.processSteps[0].body).toHaveLength(800)
    expect(out.faq[0].question).toHaveLength(240)
    expect(out.faq[0].answer).toHaveLength(1200)
  })

  it('is total-garbage-safe (null / wrong types → empty, never throws)', () => {
    expect(sanitizeServiceContent(null)).toEqual({ heroBullets: [], body: '', processSteps: [], faq: [] })
    // @ts-expect-error — intentionally malformed input
    const out = sanitizeServiceContent({ heroBullets: 'nope', body: 42, processSteps: null, faq: undefined })
    expect(out).toEqual({ heroBullets: [], body: '', processSteps: [], faq: [] })
  })
})

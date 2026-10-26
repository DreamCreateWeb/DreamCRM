import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import CinematicSpine from '@/components/marketing/cinematic-spine'
import { COMPARISONS } from '@/lib/marketing/comparisons'

/**
 * THE SPINE AND THE MATRIX TELL ONE STORY. The homepage's loudest section
 * once staged an SMS thread — Rosa replies "Yes please" and the chair fills
 * — four screens above the Honest-by-default tenet ("No SMS texting yet")
 * and on the same site as a comparison matrix that pins our SMS row to
 * "no". A prospect who read both had been shown the thing the page then
 * said does not exist.
 *
 * So the two honesty surfaces are tied to the same fact: while the matrix
 * says SMS is "no", the spine's VISIBLE words may not stage texting. Graded
 * on text content rather than raw markup, because `text-violet-700` is a
 * class name, not a claim. When the carrier registration lands and the
 * honesty flip runs, the matrix row flips first and this test becomes the
 * list of what the spine may say again.
 */

const TEXTING = /\bSMS\b|\btext(s|ed|ing)?\b/i

describe('the cinematic spine stages only the channel the product has', () => {
  const smsIsNo = COMPARISONS.every((c) => c.matrix.find((r) => r.feature.includes('SMS'))?.dreamcrm === 'no')

  it('the comparison matrix still says SMS is "no" (the premise)', () => {
    expect(smsIsNo).toBe(true)
  })

  it('while SMS is "no", no visible word in the spine stages a text', () => {
    if (!smsIsNo) return
    const { container } = render(<CinematicSpine />)
    const offenders = Array.from(container.querySelectorAll('*'))
      .filter((el) => el.children.length === 0 && TEXTING.test(el.textContent ?? ''))
      .map((el) => el.textContent?.trim())
    expect(offenders).toEqual([])
    // And the chapter that books is staged on email — the live channel.
    expect(container.textContent).toContain('THE EMAIL THAT BOOKS')
    expect(container.textContent).toContain('EMAIL · Today')
  })

  it('keeps the anchor patient’s reply hook on the booking bubble', () => {
    const { container } = render(<CinematicSpine />)
    const reply = container.querySelector('[data-anchor="reply"]')
    expect(reply).not.toBeNull()
    expect(reply?.textContent).toMatch(/booked/i)
  })

  it('does not claim the PMS write as a given — write-back is per practice', () => {
    const { container } = render(<CinematicSpine />)
    expect(container.textContent).not.toMatch(/Written to your PMS/)
    expect(container.textContent).toMatch(/in your PMS once it is connected/)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'
import FocalPointPicker from '@/components/ui/focal-point-picker'

/**
 * THE PICKER'S KEYBOARD PATH (DREAMCRM-34).
 *
 * Until this batch the focal-point picker was `onPointerDown/Move/Up` on a
 * bare `<div>` — no `tabIndex`, no `role`, no key handling — so choosing what
 * stays in frame on a clinic's hero photo was mouse-or-touch only. It was the
 * last known surface in the product a keyboard could not operate at all.
 *
 * These are the assertions that would have failed on that version, which is
 * the only reason to write them: every one names a thing a person can now do
 * that they could not before. The interesting half is the LAST group — both
 * sliders answer all four arrows, because splitting a 2D position across two
 * controls is what makes it announceable, and a person who has tabbed to
 * "vertical" and presses Left still expects the point to move left.
 */

beforeEach(() => cleanup())

function setup(value = '50% 50%', props: Record<string, unknown> = {}) {
  const onChange = vi.fn()
  render(
    <FocalPointPicker src="/photo.jpg" value={value} onChange={onChange} {...props} />,
  )
  return { onChange }
}

const horizontal = () => screen.getByRole('slider', { name: /horizontal/i })
const vertical = () => screen.getByRole('slider', { name: /vertical/i })

describe('FocalPointPicker — it is reachable and announceable', () => {
  it('exposes one named control per axis inside a named group', () => {
    setup()

    // The group is what a `<label>` could never name: batch 53 found this
    // picker's label pointing at nothing, because there was no control here.
    expect(screen.getByRole('group', { name: 'Focus point' })).toBeTruthy()
    expect(horizontal()).toBeTruthy()
    expect(vertical()).toBeTruthy()
  })

  it('names each picker for what it repositions, so four on a page differ', () => {
    setup('50% 50%', { label: 'Focus point for photo 2' })

    expect(screen.getByRole('group', { name: 'Focus point for photo 2' })).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Focus point for photo 2 — horizontal' })).toBeTruthy()
  })

  it('lets a VISIBLE heading name the group when there is one', () => {
    // The Website Studio already shows "Focus point" above the picker.
    // Repeating it in an aria-label would say it twice and could drift.
    render(
      <>
        <span id="heading">Focus point</span>
        <FocalPointPicker
          src="/photo.jpg"
          value="50% 50%"
          onChange={() => {}}
          labelledBy="heading"
        />
      </>,
    )
    expect(screen.getByRole('group', { name: 'Focus point' })).toBeTruthy()
  })

  it('reads its value as a POSITION, not a bare number', () => {
    setup('30% 70%')

    // "30" tells a screen-reader user nothing. 30% of what, from where?
    expect(horizontal().getAttribute('aria-valuetext')).toBe('30% from the left')
    expect(vertical().getAttribute('aria-valuetext')).toBe('70% from the top')
  })

  it('reflects the current focal point on both axes', () => {
    setup('25% 80%')

    expect((horizontal() as HTMLInputElement).value).toBe('25')
    expect((vertical() as HTMLInputElement).value).toBe('80')
  })
})

describe('FocalPointPicker — the arrow keys move the point', () => {
  it('nudges 1% per arrow press', () => {
    const { onChange } = setup('50% 50%')

    fireEvent.keyDown(horizontal(), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith('51% 50%')

    fireEvent.keyDown(horizontal(), { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenLastCalledWith('49% 50%')
  })

  it('moves the point UP when Up is pressed, which lowers the distance from the top', () => {
    const { onChange } = setup('50% 50%')

    fireEvent.keyDown(vertical(), { key: 'ArrowUp' })
    expect(onChange).toHaveBeenLastCalledWith('50% 49%')

    fireEvent.keyDown(vertical(), { key: 'ArrowDown' })
    expect(onChange).toHaveBeenLastCalledWith('50% 51%')
  })

  it('nudges 10% with Shift held', () => {
    const { onChange } = setup('50% 50%')

    fireEvent.keyDown(horizontal(), { key: 'ArrowRight', shiftKey: true })
    expect(onChange).toHaveBeenLastCalledWith('60% 50%')

    fireEvent.keyDown(vertical(), { key: 'ArrowUp', shiftKey: true })
    expect(onChange).toHaveBeenLastCalledWith('50% 40%')
  })

  it('jumps that axis to its edge on Home and End', () => {
    const { onChange } = setup('50% 50%')

    fireEvent.keyDown(horizontal(), { key: 'Home' })
    expect(onChange).toHaveBeenLastCalledWith('0% 50%')

    fireEvent.keyDown(vertical(), { key: 'End' })
    expect(onChange).toHaveBeenLastCalledWith('50% 100%')
  })

  it('never leaves the frame', () => {
    // The pointer path has always clamped; the keyboard path has to as well,
    // or an object-position of -3% silently renders as 0 and the control lies
    // about where the point is.
    const { onChange } = setup('2% 98%')

    fireEvent.keyDown(horizontal(), { key: 'ArrowLeft', shiftKey: true })
    expect(onChange).toHaveBeenLastCalledWith('0% 98%')

    fireEvent.keyDown(vertical(), { key: 'ArrowDown', shiftKey: true })
    expect(onChange).toHaveBeenLastCalledWith('2% 100%')
  })

  it('leaves keys it does not handle alone', () => {
    const { onChange } = setup('50% 50%')

    fireEvent.keyDown(horizontal(), { key: 'Tab' })
    fireEvent.keyDown(horizontal(), { key: 'a' })
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('FocalPointPicker — focus decides what is announced, never what works', () => {
  it('answers the cross-axis arrows on the horizontal slider', () => {
    const { onChange } = setup('50% 50%')

    fireEvent.keyDown(horizontal(), { key: 'ArrowDown' })
    expect(onChange).toHaveBeenLastCalledWith('50% 51%')
  })

  it('answers the cross-axis arrows on the vertical slider', () => {
    const { onChange } = setup('50% 50%')

    fireEvent.keyDown(vertical(), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith('51% 50%')
  })

  it('sends Home, End and the Page keys to the axis that has focus', () => {
    // The one place the two controls genuinely differ: "that end" has to mean
    // this slider's end, or Home on either would do the same thing.
    const { onChange } = setup('50% 50%')

    fireEvent.keyDown(vertical(), { key: 'Home' })
    expect(onChange).toHaveBeenLastCalledWith('50% 0%')

    fireEvent.keyDown(horizontal(), { key: 'PageUp' })
    expect(onChange).toHaveBeenLastCalledWith('60% 50%')

    fireEvent.keyDown(vertical(), { key: 'PageUp' })
    expect(onChange).toHaveBeenLastCalledWith('50% 40%')
  })
})

describe('FocalPointPicker — the drag surface is unchanged', () => {
  it('still renders the image at the chosen object-position', () => {
    const { container } = render(
      <FocalPointPicker src="/photo.jpg" value="20% 80%" onChange={() => {}} />,
    )
    const img = container.querySelector('img')!
    expect(img.style.objectPosition).toBe('20% 80%')
  })

  it('keeps the axis controls out of the visual design', () => {
    // `sr-only` and not `hidden`: clipped stays focusable, hidden does not —
    // which would put the keyboard path back where it started.
    setup()
    expect(horizontal().className).toContain('sr-only')
    expect(vertical().className).toContain('sr-only')
  })
})

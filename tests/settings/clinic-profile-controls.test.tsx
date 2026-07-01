import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

/**
 * Wire-format guards for the upgraded clinic-profile controls. Each new control
 * (brand color, hours grid, timezone picker, video URL, chip lists) MUST keep
 * serializing to the exact FormData shape `updateClinicProfile` (actions.ts +
 * lib/clinic-content-parse.ts) already parses — the whole page saves through one
 * action, so a shape drift silently breaks the save. These test the persisted
 * hidden-input / field value the mega-form Save would submit.
 */

import BrandColorField from '@/app/(default)/settings/clinic/brand-color-field'
import HoursGrid from '@/app/(default)/settings/clinic/hours-grid'
import TimezonePicker from '@/app/(default)/settings/clinic/timezone-picker'
import DifferenceVideoField from '@/app/(default)/settings/clinic/difference-video-field'
import { TagListEditor } from '@/components/ui/editor-kit'
import { parseHours, parseStringList } from '@/lib/clinic-content-parse'

beforeEach(() => cleanup())

const hidden = (name: string) =>
  document.querySelector(`input[name="${name}"]`) as HTMLInputElement | null

describe('BrandColorField', () => {
  it('persists the given hex verbatim in a hidden brandColor input', () => {
    render(<BrandColorField name="brandColor" defaultValue="#9CAF9F" />)
    expect(hidden('brandColor')!.value).toBe('#9caf9f')
  })

  it('normalizes a shorthand / hashless hex on the persisted value', () => {
    render(<BrandColorField name="brandColor" defaultValue="abc" />)
    // #abc → #aabbcc
    expect(hidden('brandColor')!.value).toBe('#aabbcc')
  })

  it('persists an empty string when blank (→ null server-side)', () => {
    render(<BrandColorField name="brandColor" defaultValue={null} />)
    expect(hidden('brandColor')!.value).toBe('')
  })

  it('exposes a native color input so the swatch opens the OS picker', () => {
    render(<BrandColorField name="brandColor" defaultValue="#123456" />)
    const color = document.querySelector('input[type="color"]') as HTMLInputElement
    expect(color).not.toBeNull()
    expect(color.value).toBe('#123456')
  })
})

describe('HoursGrid', () => {
  function collect() {
    const fd = new FormData()
    document
      .querySelectorAll('input[name^="hours["]')
      .forEach((el) => {
        const input = el as HTMLInputElement
        if (input.type === 'checkbox') {
          if (input.checked) fd.set(input.name, 'on')
        } else if (!input.disabled) {
          fd.set(input.name, input.value)
        }
      })
    return fd
  }

  it('serializes open/close per day in the shape parseHours reads', () => {
    render(
      <HoursGrid
        initial={{ mon: { open: '09:00', close: '17:00' }, sun: { closed: true } }}
      />,
    )
    const parsed = parseHours(collect())
    expect(parsed!.mon.open).toBe('09:00')
    expect(parsed!.mon.close).toBe('17:00')
    expect(parsed!.sun.closed).toBe(true)
  })

  it('a closed day submits the closed flag and no stray times', () => {
    render(<HoursGrid initial={{ tue: { open: '08:00', close: '12:00' } }} />)
    // Flip Tuesday to Closed.
    fireEvent.click(screen.getAllByRole('button', { name: 'Closed' })[1])
    const parsed = parseHours(collect())
    expect(parsed!.tue).toEqual({ closed: true })
  })

  it('"Copy Monday to weekdays" fills Tue–Fri from Monday', () => {
    render(<HoursGrid initial={{ mon: { open: '10:00', close: '18:00' } }} />)
    fireEvent.click(screen.getByRole('button', { name: /Copy Monday to weekdays/i }))
    const parsed = parseHours(collect())
    for (const d of ['mon', 'tue', 'wed', 'thu', 'fri'] as const) {
      expect(parsed![d].open).toBe('10:00')
      expect(parsed![d].close).toBe('18:00')
    }
    // Saturday untouched (not a weekday).
    expect(parsed!.sat).toBeUndefined()
  })

  it('"Copy Monday to all days" fills all seven days', () => {
    render(<HoursGrid initial={{ mon: { open: '09:30', close: '16:30' } }} />)
    fireEvent.click(screen.getByRole('button', { name: /Copy Monday to all days/i }))
    const parsed = parseHours(collect())
    for (const d of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const) {
      expect(parsed![d].open).toBe('09:30')
    }
  })
})

describe('TimezonePicker', () => {
  it('persists the given IANA id in a hidden timezone input', () => {
    render(<TimezonePicker name="timezone" defaultValue="America/Chicago" />)
    expect(hidden('timezone')!.value).toBe('America/Chicago')
  })

  it('selecting a zone updates the persisted IANA id', () => {
    render(<TimezonePicker name="timezone" defaultValue="America/New_York" />)
    fireEvent.click(screen.getByRole('button', { name: /Eastern — New York/i }))
    // London is in the widened list — pick it.
    fireEvent.click(screen.getByRole('option', { name: /London/i }))
    expect(hidden('timezone')!.value).toBe('Europe/London')
  })

  it('keeps an unknown legacy zone selectable (never silently drops it)', () => {
    render(<TimezonePicker name="timezone" defaultValue="Antarctica/Troll" />)
    expect(hidden('timezone')!.value).toBe('Antarctica/Troll')
  })
})

describe('DifferenceVideoField', () => {
  it('persists the URL under the differenceVideoUrl field', () => {
    render(
      <DifferenceVideoField name="differenceVideoUrl" defaultValue="https://cdn.example/clip.mp4" />,
    )
    expect(
      (document.querySelector('input[name="differenceVideoUrl"]') as HTMLInputElement).value,
    ).toBe('https://cdn.example/clip.mp4')
  })

  it('renders a preview <video> for a valid direct video URL', () => {
    render(
      <DifferenceVideoField name="differenceVideoUrl" defaultValue="https://cdn.example/clip.webm" />,
    )
    expect(document.querySelector('video')).not.toBeNull()
  })

  it('flags an invalid URL and shows no preview', () => {
    render(<DifferenceVideoField name="differenceVideoUrl" defaultValue="not a url" />)
    const input = document.querySelector('input[name="differenceVideoUrl"]') as HTMLInputElement
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(document.querySelector('video')).toBeNull()
  })
})

describe('TagListEditor (insurance carriers / payment methods)', () => {
  it('round-trips chips through parseStringList as the mega-form save would', () => {
    render(<TagListEditor name="acceptedInsuranceCarriers" defaultValue={['Aetna', 'Cigna']} />)
    const value = hidden('acceptedInsuranceCarriers')!.value
    // Persisted as newline-joined text → parseStringList reads it as string[].
    expect(parseStringList(value)).toEqual(['Aetna', 'Cigna'])
  })

  it('type-and-Enter adds a chip; the persisted value grows', () => {
    render(<TagListEditor name="paymentMethods" defaultValue={['Cash']} />)
    const box = screen.getByPlaceholderText(/add another/i)
    fireEvent.change(box, { target: { value: 'HSA / FSA cards' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(parseStringList(hidden('paymentMethods')!.value)).toEqual(['Cash', 'HSA / FSA cards'])
  })
})

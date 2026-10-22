/**
 * The icon drawer (components/website/service-icon-picker.tsx) — one picker
 * for the Studio canvas and the services list: curated glyphs (searchable),
 * emoji, or an upload; "No icon" hands back null.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'
import { ServiceIconPickerPanel } from '@/components/website/service-icon-picker'

vi.mock('@/components/ui/image-uploader', () => ({
  default: ({ label }: { label: string }) => <div data-testid="uploader">{label}</div>,
}))

describe('ServiceIconPickerPanel', () => {
  it('opens on the Icons tab with every glyph, and a glyph click hands back icon:<id>', () => {
    const onPick = vi.fn()
    render(<ServiceIconPickerPanel current={null} onPick={onPick} />)
    expect(screen.getByRole('tab', { name: 'Icons' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('No icon yet')).toBeTruthy()
    fireEvent.click(screen.getByTestId('service-icon-glyph-tooth'))
    expect(onPick).toHaveBeenCalledWith('icon:tooth')
    cleanup()
  })

  it('search narrows the glyphs by purpose', () => {
    render(<ServiceIconPickerPanel current={null} onPick={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Search icons'), { target: { value: 'whitening' } })
    expect(screen.getByTestId('service-icon-glyph-sparkle')).toBeTruthy()
    expect(screen.queryByTestId('service-icon-glyph-calendar')).toBeNull()
    fireEvent.change(screen.getByLabelText('Search icons'), { target: { value: 'qqq' } })
    expect(screen.getByText(/Nothing by that name/)).toBeTruthy()
    cleanup()
  })

  it('marks the current glyph pressed and offers "No icon" only when there is one', () => {
    const onPick = vi.fn()
    render(<ServiceIconPickerPanel current="icon:crown" onPick={onPick} />)
    expect(screen.getByTestId('service-icon-glyph-crown').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Crown', { selector: 'p' })).toBeTruthy()
    const none = screen.getByTestId('service-icon-none') as HTMLButtonElement
    expect(none.disabled).toBe(false)
    fireEvent.click(none)
    expect(onPick).toHaveBeenCalledWith(null)
    cleanup()
    render(<ServiceIconPickerPanel current={null} onPick={onPick} />)
    expect((screen.getByTestId('service-icon-none') as HTMLButtonElement).disabled).toBe(true)
    cleanup()
  })

  it('an emoji current opens on the Emoji tab, and an emoji click hands it back', () => {
    const onPick = vi.fn()
    render(<ServiceIconPickerPanel current="😁" onPick={onPick} />)
    expect(screen.getByRole('tab', { name: 'Emoji' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Emoji 🦷' }))
    expect(onPick).toHaveBeenCalledWith('🦷')
    cleanup()
  })

  it('an uploaded current opens on Upload your own, which mounts the uploader', () => {
    render(<ServiceIconPickerPanel current="https://x.example/icon.png" onPick={vi.fn()} />)
    expect(screen.getByRole('tab', { name: 'Upload your own' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByTestId('uploader').textContent).toBe('Your own picture')
    expect(screen.getByText('Your own picture', { selector: 'p' })).toBeTruthy()
    cleanup()
  })

  it('busy disables every choice', () => {
    render(<ServiceIconPickerPanel current="icon:tooth" onPick={vi.fn()} busy />)
    expect((screen.getByTestId('service-icon-glyph-tooth') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('service-icon-none') as HTMLButtonElement).disabled).toBe(true)
    cleanup()
  })
})

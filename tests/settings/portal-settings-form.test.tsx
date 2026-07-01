import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DEFAULT_PORTAL_SETTINGS, type PortalSettings } from '@/lib/types/portal'

/**
 * Settings → Patient portal form. Covers the upgrade work:
 * - the notice-window preset picker (pills + Custom escape hatch) persists the
 *   integer hours a preset represents (and lets you type an off-preset value),
 * - the Stripe-Connect callout renders above a DISABLED payments toggle when
 *   Connect is inactive, and the toggle enables + saves once Connect is ready,
 * - the SettingsTabs ids (features / booking / voice) are preserved.
 */

const savePortalSettingsAction =
  vi.fn<(s: PortalSettings) => Promise<{ ok: true } | { ok: false; error: string }>>(async () => ({ ok: true }))
vi.mock('@/app/(default)/settings/portal/actions', () => ({
  savePortalSettingsAction: (s: PortalSettings) => savePortalSettingsAction(s),
}))
// SettingsTabs reads ?tab=&sub= via useSearchParams.
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))

import PortalSettingsForm from '@/app/(default)/settings/portal/portal-settings-form'

function clone(): PortalSettings {
  return structuredClone(DEFAULT_PORTAL_SETTINGS)
}

beforeEach(() => {
  savePortalSettingsAction.mockClear()
  savePortalSettingsAction.mockResolvedValue({ ok: true })
})

describe('PortalSettingsForm — top-level tabs', () => {
  it('keeps the three tab ids/labels (features / booking / voice)', () => {
    render(<PortalSettingsForm initial={clone()} connectReady storefrontEnabled />)
    expect(screen.getByRole('tab', { name: 'Features' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Booking' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Voice & display' })).toBeTruthy()
  })
})

describe('PortalSettingsForm — notice-window presets', () => {
  it('selecting a preset persists the hours it represents', async () => {
    render(<PortalSettingsForm initial={clone()} connectReady storefrontEnabled />)
    fireEvent.click(screen.getByRole('tab', { name: 'Booking' }))

    // "Earliest online booking" defaults to 2h; move it to 48 hours.
    const buttons = screen.getAllByRole('button', { name: '48 hours' })
    expect(buttons.length).toBeGreaterThan(0)
    fireEvent.click(buttons[0]!) // first NoticePicker = earliest booking

    fireEvent.click(screen.getByRole('button', { name: /Save portal settings/i }))
    await waitFor(() => expect(savePortalSettingsAction).toHaveBeenCalledTimes(1))
    const saved = savePortalSettingsAction.mock.calls[0]![0]
    expect(saved.booking.minNoticeHours).toBe(48)
  })

  it('the "1 week" preset persists 168 hours', async () => {
    render(<PortalSettingsForm initial={clone()} connectReady storefrontEnabled />)
    fireEvent.click(screen.getByRole('tab', { name: 'Booking' }))
    fireEvent.click(screen.getAllByRole('button', { name: '1 week' })[0]!)
    fireEvent.click(screen.getByRole('button', { name: /Save portal settings/i }))
    await waitFor(() => expect(savePortalSettingsAction).toHaveBeenCalled())
    expect(savePortalSettingsAction.mock.calls[0]![0].booking.minNoticeHours).toBe(168)
  })

  it('an off-preset stored value opens Custom with the raw hours in the number box', () => {
    const s = clone()
    s.booking.minNoticeHours = 7 // not one of the presets
    render(<PortalSettingsForm initial={s} connectReady storefrontEnabled />)
    fireEvent.click(screen.getByRole('tab', { name: 'Booking' }))
    // The earliest-booking custom input exists and shows 7.
    const custom = document.getElementById('booking-notice-custom') as HTMLInputElement
    expect(custom).toBeTruthy()
    expect(custom.value).toBe('7')
  })

  it('Custom… reveals a number input that persists an arbitrary hour value', async () => {
    render(<PortalSettingsForm initial={clone()} connectReady storefrontEnabled />)
    fireEvent.click(screen.getByRole('tab', { name: 'Booking' }))

    // Open Custom on the reschedule picker and type 6.
    const customButtons = screen.getAllByRole('button', { name: 'Custom…' })
    fireEvent.click(customButtons[1]!) // second picker = reschedule cutoff
    const input = document.getElementById('reschedule-notice-custom') as HTMLInputElement
    expect(input).toBeTruthy()
    fireEvent.change(input, { target: { value: '6' } })

    fireEvent.click(screen.getByRole('button', { name: /Save portal settings/i }))
    await waitFor(() => expect(savePortalSettingsAction).toHaveBeenCalled())
    expect(savePortalSettingsAction.mock.calls[0]![0].reschedule.minNoticeHours).toBe(6)
  })
})

describe('PortalSettingsForm — payments gate', () => {
  it('shows the Connect callout and disables the payments toggle when Connect is inactive', () => {
    render(<PortalSettingsForm initial={clone()} connectReady={false} storefrontEnabled />)
    // Callout above the toggle explains why it's locked + links to Shop → Connect.
    expect(screen.getByText(/need a connected Stripe account/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Shop → Connect/i })).toBeTruthy()

    const toggle = screen.getByRole('switch', { name: 'Online payments' }) as HTMLButtonElement
    expect(toggle.disabled).toBe(true)
  })

  it('enables the payments toggle (no callout) when Connect is active and can save it on', async () => {
    render(<PortalSettingsForm initial={clone()} connectReady storefrontEnabled />)
    expect(screen.queryByText(/need a connected Stripe account/i)).toBeNull()

    const toggle = screen.getByRole('switch', { name: 'Online payments' }) as HTMLButtonElement
    expect(toggle.disabled).toBe(false)
    fireEvent.click(toggle) // default is OFF → turn ON

    fireEvent.click(screen.getByRole('button', { name: /Save portal settings/i }))
    await waitFor(() => expect(savePortalSettingsAction).toHaveBeenCalled())
    expect(savePortalSettingsAction.mock.calls[0]![0].features.payments).toBe(true)
  })
})

describe('PortalSettingsForm — bookable types', () => {
  it('keeps at least one bookable type selected (cannot deselect the last one)', () => {
    const s = clone()
    s.booking.allowedTypes = ['cleaning'] // only one left
    render(<PortalSettingsForm initial={s} connectReady storefrontEnabled />)
    fireEvent.click(screen.getByRole('tab', { name: 'Booking' }))
    const cleaning = screen.getByRole('button', { name: 'Cleaning' }) as HTMLButtonElement
    expect(cleaning.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(cleaning) // attempt to remove the last one — should be a no-op
    expect(cleaning.getAttribute('aria-pressed')).toBe('true')
  })
})

describe('PortalSettingsForm — feature toggles wire to real keys', () => {
  it('toggling Messages off persists features.messages=false', async () => {
    render(<PortalSettingsForm initial={clone()} connectReady storefrontEnabled />)
    const messages = screen.getByRole('switch', { name: 'Messages' })
    fireEvent.click(messages) // default ON → OFF
    fireEvent.click(screen.getByRole('button', { name: /Save portal settings/i }))
    await waitFor(() => expect(savePortalSettingsAction).toHaveBeenCalled())
    expect(savePortalSettingsAction.mock.calls[0]![0].features.messages).toBe(false)
  })
})

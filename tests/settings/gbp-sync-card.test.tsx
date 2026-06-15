import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

const actions = {
  syncFromGoogleAction: vi.fn(async (..._a: unknown[]) => ({ ok: true as const, applied: ['hours', 'phone'], skippedManual: ['address'], photoCount: 2 })),
  revertFieldToManualAction: vi.fn(async (..._a: unknown[]) => ({ ok: true as const })),
  importGooglePhotosAction: vi.fn(async (..._a: unknown[]) => ({ ok: true as const, added: 1 })),
}
vi.mock('@/app/(default)/settings/clinic/gbp-actions', () => ({
  syncFromGoogleAction: (...a: unknown[]) => actions.syncFromGoogleAction(...a),
  useGoogleVersionAction: (...a: unknown[]) => actions.syncFromGoogleAction(...a),
  revertFieldToManualAction: (...a: unknown[]) => actions.revertFieldToManualAction(...a),
  importGooglePhotosAction: (...a: unknown[]) => actions.importGooglePhotosAction(...a),
}))

import GbpSyncCard from '@/app/(default)/settings/clinic/gbp-sync-card'
import type { GbpSyncState } from '@/lib/types/zernio'

function state(over: Partial<GbpSyncState> = {}): GbpSyncState {
  return {
    connected: true,
    isDemo: false,
    sources: { hours: 'google', address: 'manual', phone: 'google' },
    lastSyncedAtIso: '2026-06-10T00:00:00Z',
    googlePhotos: [],
    importedPhotoUrls: [],
    ...over,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('GbpSyncCard — disconnected', () => {
  it('renders a connect prompt linking to /integrations (no dead sync button)', () => {
    render(<GbpSyncCard state={state({ connected: false })} />)
    expect(screen.getByText('Sync from Google')).toBeTruthy()
    const link = screen.getByRole('link', { name: /Connect Google Business/i }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/integrations')
    expect(screen.queryByRole('button', { name: /^Sync from Google$/ })).toBeNull()
  })
})

describe('GbpSyncCard — connected provenance', () => {
  it('shows "From Google · synced {date}" for google-sourced fields', () => {
    render(<GbpSyncCard state={state()} />)
    // hours + phone are google-sourced → at least two "From Google · synced" pills.
    const pills = screen.getAllByText(/From Google · synced/i)
    expect(pills.length).toBeGreaterThanOrEqual(2)
  })

  it('shows "You\'ve customized this" for a manual field', () => {
    render(<GbpSyncCard state={state()} />)
    // address source is 'manual'.
    expect(screen.getByText(/You've customized this/i)).toBeTruthy()
  })

  it('the Sync-from-Google button calls the force-sync action', async () => {
    render(<GbpSyncCard state={state()} />)
    fireEvent.click(screen.getByRole('button', { name: /^Sync from Google$/ }))
    await waitFor(() => expect(actions.syncFromGoogleAction).toHaveBeenCalledTimes(1))
  })

  it('a manual field offers "Use Google\'s version" which re-syncs', async () => {
    render(<GbpSyncCard state={state()} />)
    fireEvent.click(screen.getByRole('button', { name: /Use Google's version/i }))
    await waitFor(() => expect(actions.syncFromGoogleAction).toHaveBeenCalled())
  })

  it('a google field offers "Stop syncing" which reverts it to manual', async () => {
    render(<GbpSyncCard state={state()} />)
    // hours + phone are google → two "Stop syncing" controls; click the first.
    const stops = screen.getAllByRole('button', { name: /Stop syncing/i })
    expect(stops.length).toBeGreaterThanOrEqual(2)
    fireEvent.click(stops[0])
    await waitFor(() => expect(actions.revertFieldToManualAction).toHaveBeenCalledTimes(1))
  })
})

describe('GbpSyncCard — photo import gallery', () => {
  it('renders the Google photo gallery + marks already-imported photos', () => {
    render(
      <GbpSyncCard
        state={state({
          googlePhotos: [
            { url: 'https://g/new.jpg', sourceUrl: null, category: 'INTERIOR' },
            { url: 'https://g/already.jpg', sourceUrl: null, category: 'EXTERIOR' },
          ],
          importedPhotoUrls: ['https://g/already.jpg'],
        })}
      />,
    )
    expect(screen.getByText('Photos from Google')).toBeTruthy()
    // The already-imported photo shows an "Added" badge.
    expect(screen.getByText('Added')).toBeTruthy()
  })

  it('selecting a new photo + importing calls the import action', async () => {
    render(
      <GbpSyncCard
        state={state({
          googlePhotos: [{ url: 'https://g/new.jpg', sourceUrl: null, category: 'INTERIOR' }],
          importedPhotoUrls: [],
        })}
      />,
    )
    // Select the importable photo (its button is labeled by alt 'INTERIOR').
    fireEvent.click(screen.getByRole('button', { name: 'INTERIOR' }))
    fireEvent.click(screen.getByRole('button', { name: /Import .*to my gallery/i }))
    await waitFor(() => expect(actions.importGooglePhotosAction).toHaveBeenCalledWith(['https://g/new.jpg']))
  })

  it('does not render the gallery when there are no Google photos', () => {
    render(<GbpSyncCard state={state({ googlePhotos: [] })} />)
    expect(screen.queryByText('Photos from Google')).toBeNull()
  })
})

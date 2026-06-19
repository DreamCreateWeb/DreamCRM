/**
 * The generic SavedViewsBar (shared by the agenda + future lists). Pins: views
 * render as reopen links, the active one highlights, "Save view" appears only
 * for a non-empty unsaved filter combo and calls onSave (adding the pill), and
 * deleting a pill calls onDelete + removes it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

import SavedViewsBar, { type SavedViewChip } from '@/components/saved-views/saved-views-bar'

const VIEWS: SavedViewChip[] = [
  { id: 'v1', name: 'No-shows', query: 'attention=no_show' },
  { id: 'v2', name: 'This week', query: 'window=this_week' },
]

function setup(overrides: Partial<React.ComponentProps<typeof SavedViewsBar>> = {}) {
  const onSave = vi.fn(async (name: string) => ({ ok: true as const, view: { id: 'v9', name, query: 'window=past_30d' } }))
  const onDelete = vi.fn(async () => ({ ok: true as const }))
  render(
    <SavedViewsBar
      basePath="/appointments"
      allLabel="Next 14 days"
      views={VIEWS}
      currentQuery=""
      isEmpty
      isActiveSaved={false}
      suggestedName="Past 30 days"
      onSave={onSave}
      onDelete={onDelete}
      {...overrides}
    />,
  )
  return { onSave, onDelete }
}

beforeEach(() => vi.clearAllMocks())

describe('SavedViewsBar', () => {
  it('renders each view as a reopen link under the base path', () => {
    setup()
    const link = screen.getByRole('link', { name: 'No-shows' })
    expect(link.getAttribute('href')).toBe('/appointments?attention=no_show')
  })

  it('hides "Save view" when the current filters are empty', () => {
    setup({ isEmpty: true })
    expect(screen.queryByRole('button', { name: '+ Save view' })).toBeNull()
  })

  it('hides "Save view" when the current query already matches a saved view', () => {
    setup({ isEmpty: false, isActiveSaved: true, currentQuery: 'attention=no_show' })
    expect(screen.queryByRole('button', { name: '+ Save view' })).toBeNull()
  })

  it('saves the current combo and adds it as a pill', async () => {
    const { onSave } = setup({ isEmpty: false, currentQuery: 'window=past_30d', suggestedName: 'Past 30 days' })
    fireEvent.click(screen.getByRole('button', { name: '+ Save view' }))
    // The name input prefills from suggestedName.
    const input = screen.getByPlaceholderText('Name this view') as HTMLInputElement
    expect(input.value).toBe('Past 30 days')
    fireEvent.change(input, { target: { value: 'Recall sweep' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Recall sweep'))
    await waitFor(() => expect(screen.getByRole('link', { name: 'Recall sweep' })).toBeTruthy())
  })

  it('highlights the active view (teal ring) when its query matches', () => {
    setup({ isEmpty: false, currentQuery: 'window=this_week' })
    const active = screen.getByRole('link', { name: 'This week' })
    expect(active.className).toMatch(/ring-teal-500/)
  })

  it('deletes a view via its ✕ and removes the pill', async () => {
    const { onDelete } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Delete view No-shows' }))
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('v1'))
    await waitFor(() => expect(screen.queryByRole('link', { name: 'No-shows' })).toBeNull())
  })
})

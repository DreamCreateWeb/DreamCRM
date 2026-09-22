import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * WHAT THE PRACTICE ACTUALLY SEES WHEN IT TURNS WRITE-BACK OFF (DREAMCRM-97).
 *
 * The service half counts what a flip to "Import only" stranded; these are the
 * two places that number has to land, and both of them used to say the
 * opposite of the truth:
 *
 *  - the flip itself said "Import only — bookings stay in DreamCRM.", which
 *    reads like a preference and not like "the four bookings already queued
 *    for your PMS are never going";
 *  - the Integrations KPI went on reporting "Will push on next sync" on every
 *    page load afterwards. A warning shown once and contradicted forever after
 *    is not a warning, so the durable half is graded here too.
 */

const setSyncDirectionAction = vi.fn()
const setAutoSyncAction = vi.fn()
vi.mock('@/app/(default)/integrations/actions', () => ({
  setSyncDirectionAction: (d: unknown) => setSyncDirectionAction(d),
  setAutoSyncAction: (e: unknown) => setAutoSyncAction(e),
  disconnectPmsAction: vi.fn(),
  syncNowAction: vi.fn(),
}))
vi.mock('@/components/ui/confirm-dialog', () => ({
  useConfirm: () => async () => true,
  useConfirmSafe: () => async () => true,
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

import SyncControls from '@/app/(default)/integrations/sync-controls'
import { PmsConnectedDashboard } from '@/app/(default)/integrations/_pms-dashboard'

beforeEach(() => {
  setSyncDirectionAction.mockReset()
  setAutoSyncAction.mockReset()
  setSyncDirectionAction.mockResolvedValue({ queuedWrites: 0, strandedWrites: 0, oldestStrandedAt: null })
})

describe('the "Import only" flip names what it stranded', () => {
  it('tells the practice how many queued changes will not be sent, and how to send them', async () => {
    setSyncDirectionAction.mockResolvedValue({
      queuedWrites: 4,
      strandedWrites: 4,
      oldestStrandedAt: new Date('2026-09-18T09:15:00Z'),
    })
    render(<SyncControls syncDirection="two_way" autoSyncEnabled isDemo={false} />)

    fireEvent.click(screen.getByRole('button', { name: /Two-way sync/i }))

    const toast = await screen.findByRole('status')
    expect(toast).toHaveTextContent(/4 changes that were waiting to reach your PMS/i)
    expect(toast).toHaveTextContent(/will not be sent/i)
    // The way back, and nothing more — draining or discarding a stranded op is
    // a product decision with its own (not-1.0) ledger entry.
    expect(toast).toHaveTextContent(/turn two-way sync back on/i)
    expect(toast).toHaveTextContent(/oldest queued/i)
  })

  it('speaks in the card’s number when the queue holds more than the flip stranded', async () => {
    // Sentinel's N3 on #663: the "Awaiting write-back" card counts every
    // unfinished op and the flip strands only the ones still being retried, so
    // a toast reading "4 will not be sent" beside a card reading "10" left the
    // reader to guess which number was about them.
    setSyncDirectionAction.mockResolvedValue({
      queuedWrites: 10,
      strandedWrites: 4,
      oldestStrandedAt: new Date('2026-09-18T09:15:00Z'),
    })
    render(<SyncControls syncDirection="two_way" autoSyncEnabled isDemo={false} />)
    fireEvent.click(screen.getByRole('button', { name: /Two-way sync/i }))

    const toast = await screen.findByRole('status')
    expect(toast).toHaveTextContent(/none of the 10 changes waiting for your PMS will be sent/i)
    expect(toast).toHaveTextContent(/4 of them were still being retried/i)
    expect(toast).toHaveTextContent(/turn two-way sync back on/i)
  })

  it('still warns when the whole queue had already stopped retrying', async () => {
    // Nothing was taken away by THIS click, but the card still shows 6 and now
    // reads "Held" — a toast that said "bookings stay in DreamCRM" beside it
    // would be the reassuring half of the same defect.
    setSyncDirectionAction.mockResolvedValue({
      queuedWrites: 6,
      strandedWrites: 0,
      oldestStrandedAt: null,
    })
    render(<SyncControls syncDirection="two_way" autoSyncEnabled isDemo={false} />)
    fireEvent.click(screen.getByRole('button', { name: /Two-way sync/i }))

    const toast = await screen.findByRole('status')
    expect(toast.className).toContain('border-l-amber-500')
    expect(toast).toHaveTextContent(/nothing more will be sent to your PMS/i)
    expect(toast).toHaveTextContent(/The 6 on your write-back queue had already stopped retrying/i)
  })

  it('reads as a warning rather than a confirmation, and counts in English', async () => {
    setSyncDirectionAction.mockResolvedValue({
      queuedWrites: 1,
      strandedWrites: 1,
      oldestStrandedAt: new Date('2026-09-20T12:00:00Z'),
    })
    render(<SyncControls syncDirection="two_way" autoSyncEnabled isDemo={false} />)
    fireEvent.click(screen.getByRole('button', { name: /Two-way sync/i }))

    const toast = await screen.findByRole('status')
    // Amber, not the emerald every other toast on this control uses. It stays
    // POLITE on purpose: the action succeeded, and FlashToast reserves
    // assertive for a failure being reported — a successful flip with a
    // consequence is not that, and re-pointing the shared component's a11y
    // mapping to make one sentence louder is a design-system change, not this
    // slice's. The colour and the 12s dwell are what carry the difference.
    expect(toast.className).toContain('border-l-amber-500')
    expect(toast).toHaveTextContent(/1 change that was waiting/i)
    expect(toast).not.toHaveTextContent(/changes that were/i)
  })

  it('keeps the plain confirmation when there is nothing queued to strand', async () => {
    render(<SyncControls syncDirection="two_way" autoSyncEnabled isDemo={false} />)
    fireEvent.click(screen.getByRole('button', { name: /Two-way sync/i }))
    await waitFor(() => expect(setSyncDirectionAction).toHaveBeenCalledWith('import'))
    const toast = await screen.findByRole('status')
    expect(toast).toHaveTextContent(/Import only — bookings stay in DreamCRM/i)
    expect(toast.className).toContain('border-l-emerald-500')
  })

  it('turning two-way sync back ON is never a warning', async () => {
    render(<SyncControls syncDirection="import" autoSyncEnabled isDemo={false} />)
    fireEvent.click(screen.getByRole('button', { name: /Import only/i }))
    await waitFor(() => expect(setSyncDirectionAction).toHaveBeenCalledWith('two_way'))
    const toast = await screen.findByRole('status')
    expect(toast).toHaveTextContent(/Two-way sync on/i)
  })
})

function dashboard(syncDirection: 'two_way' | 'import', pendingWrites: number) {
  return {
    connection: {
      id: 'c1',
      organizationId: 'org_1',
      provider: 'demo',
      status: 'connected',
      syncDirection,
      autoSyncEnabled: 1,
      lastSyncStatus: 'success',
      lastSyncAt: new Date('2026-09-20T12:00:00Z'),
      lastError: null,
      meta: {},
    },
    counts: { patients: 2, appointments: 2, providers: 1 },
    totals: { patients: 2, appointments: 2 },
    pendingWrites,
    recentRuns: [],
    recentWrites: [],
  } as unknown as Parameters<typeof PmsConnectedDashboard>[0]['dashboard']
}

const health = { status: 'ok', severity: 'info', message: '' } as unknown as Parameters<
  typeof PmsConnectedDashboard
>[0]['health']

describe('the "Awaiting write-back" card stops promising a push that cannot happen', () => {
  it('says the queue is HELD while the connection is import-only', () => {
    render(<PmsConnectedDashboard dashboard={dashboard('import', 4)} health={health} canManage />)
    expect(screen.getByText(/Held — two-way sync is off/i)).toBeInTheDocument()
    expect(screen.queryByText(/Will push on next sync/i)).not.toBeInTheDocument()
  })

  it('still promises the push on a two-way connection, where it is true', () => {
    render(<PmsConnectedDashboard dashboard={dashboard('two_way', 4)} health={health} canManage />)
    expect(screen.getByText(/Will push on next sync/i)).toBeInTheDocument()
  })

  it('an empty queue reads the same either way', () => {
    render(<PmsConnectedDashboard dashboard={dashboard('import', 0)} health={health} canManage />)
    expect(screen.getByText(/All bookings pushed/i)).toBeInTheDocument()
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import SyncedLine from '@/app/(double-sidebar)/inbox/components/synced-line'

/**
 * ML-59 — /inbox renders from the database: no Gmail sync and no backfill is
 * awaited on the request path; the page only stamps `wanted_at` and kicks a
 * background sync through after(); the synced-ago line reads the real column.
 */
const src = readFileSync('app/(double-sidebar)/inbox/page.tsx', 'utf8')

describe('/inbox page', () => {
  it('never awaits or imports a sync or a backfill', () => {
    expect(src).not.toMatch(/await\s+(syncAccount|classifyPendingIntents|resolvePendingInlineImages|backfillRfcMessageIds)/)
    expect(src).not.toMatch(/\b(syncAccount|backfillRfcMessageIds|resolvePendingInlineImages|classifyPendingIntents),/)
  })
  it('stamps the wanted mailbox and kicks the sync after the response', () => {
    expect(src).toContain('await markMailboxesWanted(')
    expect(src).toMatch(/after\(\(\) => kickMailboxSync\(/)
  })
})

describe('SyncedLine', () => {
  it('reads the real column: synced-ago plus checking while a sync runs', () => {
    const t = new Date(Date.now() - 4 * 60_000).toISOString()
    render(<SyncedLine accounts={[{ lastSyncAt: t, syncStatus: 'syncing' }]} />)
    expect(screen.getByTestId('inbox-synced-line').textContent).toMatch(/^Synced .*· checking/)
  })
  it('says plainly when a mailbox has never synced', () => {
    render(<SyncedLine accounts={[{ lastSyncAt: null, syncStatus: 'pending' }]} />)
    expect(screen.getAllByTestId('inbox-synced-line').pop()!.textContent).toMatch(/will sync shortly/)
  })
})

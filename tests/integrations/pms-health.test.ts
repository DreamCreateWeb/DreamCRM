import { describe, it, expect } from 'vitest'
import { deriveIntegrationsHealth } from '@/lib/services/pms/health'

const now = new Date('2026-06-01T12:00:00Z')
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000)

const baseConn = {
  organizationId: 'org_1',
  provider: 'open_dental',
  status: 'connected',
  autoSyncEnabled: 1 as number,
  lastSyncAt: hoursAgo(1) as Date | null,
  lastSyncStatus: 'success' as string | null,
  lastError: null as string | null,
}

describe('deriveIntegrationsHealth', () => {
  it("returns 'ok' for a healthy recent sync", () => {
    const h = deriveIntegrationsHealth(baseConn, [{ status: 'success' }], now)
    expect(h.status).toBe('ok')
    expect(h.severity).toBe('info')
    expect(h.consecutiveFailures).toBe(0)
  })

  it("returns 'never_synced' for a connection with no lastSyncAt yet", () => {
    const h = deriveIntegrationsHealth({ ...baseConn, lastSyncAt: null, lastSyncStatus: null }, [], now)
    expect(h.status).toBe('never_synced')
    expect(h.severity).toBe('info')
  })

  it("returns 'errored' with the connection-level lastError when conn.status='error'", () => {
    const h = deriveIntegrationsHealth(
      { ...baseConn, status: 'error', lastError: 'OD returned 401 (bad customer key)' },
      [],
      now,
    )
    expect(h.status).toBe('errored')
    expect(h.severity).toBe('error')
    expect(h.message).toContain('OD returned 401')
  })

  it("returns 'repeated_failure' when 3+ recent runs in a row are non-success", () => {
    const h = deriveIntegrationsHealth(baseConn, [{ status: 'error' }, { status: 'partial' }, { status: 'error' }], now)
    expect(h.status).toBe('repeated_failure')
    expect(h.severity).toBe('error')
    expect(h.consecutiveFailures).toBe(3)
  })

  it("a successful run in the streak breaks consecutive failures", () => {
    const h = deriveIntegrationsHealth(
      baseConn,
      [{ status: 'error' }, { status: 'success' }, { status: 'error' }, { status: 'error' }],
      now,
    )
    expect(h.consecutiveFailures).toBe(1)
    // Not 'repeated_failure', falls through to the lastSyncStatus check.
    expect(h.status).not.toBe('repeated_failure')
  })

  it("returns 'errored' for a single failed last sync (not a streak)", () => {
    const h = deriveIntegrationsHealth(
      { ...baseConn, lastSyncStatus: 'error', lastError: 'timeout' },
      [{ status: 'error' }],
      now,
    )
    expect(h.status).toBe('errored')
    expect(h.severity).toBe('error')
    expect(h.message).toContain('timeout')
  })

  it("returns 'stale' when auto-sync is on and the last sync is older than the staleness window", () => {
    const h = deriveIntegrationsHealth(
      { ...baseConn, lastSyncAt: hoursAgo(48) },
      [{ status: 'success' }],
      now,
    )
    expect(h.status).toBe('stale')
    expect(h.severity).toBe('warn')
    expect(h.message).toMatch(/48 hours/)
  })

  it("does NOT report stale when auto-sync is disabled", () => {
    const h = deriveIntegrationsHealth(
      { ...baseConn, autoSyncEnabled: 0, lastSyncAt: hoursAgo(72) },
      [{ status: 'success' }],
      now,
    )
    expect(h.status).toBe('ok')
  })

  it("returns 'partial' when the last sync skipped records (no streak, not stale)", () => {
    const h = deriveIntegrationsHealth(
      { ...baseConn, lastSyncStatus: 'partial' },
      [{ status: 'partial' }, { status: 'success' }],
      now,
    )
    expect(h.status).toBe('partial')
    expect(h.severity).toBe('warn')
  })
})

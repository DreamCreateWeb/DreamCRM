/**
 * The public site's pageview beacon counts VISITORS, not the practice
 * looking at its own site.
 *
 * Every "View live" door on the hub, the Studio, Content and Pages opens the
 * counted route, and the dedupe is per browser session per path, so the
 * owner's check after each edit rolled into the hub's "visits" number and
 * its delta. The layout now hands the beacon the same `canEdit` that gates
 * the EditBridge, and an editor is never posted.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import React from 'react'

let pathname = '/site/acme/about'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

import SiteViewBeacon from '@/components/clinic-site/site-view-beacon'

const sendBeacon = vi.fn(() => true)
const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))

beforeEach(() => {
  cleanup()
  sendBeacon.mockClear()
  fetchMock.mockClear()
  Object.defineProperty(navigator, 'sendBeacon', { value: sendBeacon, configurable: true })
  vi.stubGlobal('fetch', fetchMock)
  try {
    sessionStorage.clear()
  } catch {
    /* private mode */
  }
  window.history.replaceState({}, '', '/site/acme/about')
})
afterEach(() => {
  vi.unstubAllGlobals()
})

async function posted(): Promise<Array<{ orgId: string; path: string }>> {
  const out: Array<{ orgId: string; path: string }> = []
  for (const call of sendBeacon.mock.calls as unknown as Array<[string, Blob]>) {
    out.push(JSON.parse(await call[1].text()))
  }
  return out
}

describe('SiteViewBeacon', () => {
  it('a visitor is counted once, on the PUBLIC path', async () => {
    render(<SiteViewBeacon orgId="org_1" slug="acme" />)
    expect(sendBeacon).toHaveBeenCalledTimes(1)
    expect(await posted()).toEqual([{ orgId: 'org_1', path: '/about' }])
  })

  it('a verified editor of the site is never counted (skip)', () => {
    render(<SiteViewBeacon orgId="org_1" slug="acme" skip />)
    expect(sendBeacon).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
    // …and nothing was written to the session dedupe either, so a later
    // real visitor on this browser (the office iPad) still counts.
    expect(sessionStorage.getItem('siteview_org_1_/about')).toBeNull()
  })

  it('the Studio canvas (?edit=1) is still skipped on its own', () => {
    window.history.replaceState({}, '', '/site/acme/about?edit=1')
    render(<SiteViewBeacon orgId="org_1" slug="acme" />)
    expect(sendBeacon).not.toHaveBeenCalled()
  })
})

describe('the layout threads the editor status to the beacon', () => {
  it('passes the same canEdit that gates the EditBridge', () => {
    const src = readFileSync(resolve(__dirname, '../../app/site/[slug]/layout.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
    expect(src).toMatch(/<SiteViewBeacon[^>]*skip=\{canEdit\}/)
    expect(src).toMatch(/<EditBridgeGate[^>]*canEdit=\{canEdit\}/)
  })
})

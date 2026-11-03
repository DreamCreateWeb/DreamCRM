/**
 * A link that opens a NEW TAB is never an in-app navigation, so ActionButton
 * tells Next not to prefetch it. The prefetch is a real GET: the CSV export
 * routes answered it by running a whole export on every visit to the list,
 * and the request never settled, so /patients and /leads never reached
 * network-idle (e2e/dashboard-viewport.spec.ts caught it the day the list
 * pages joined its journey). In-app links keep Next's default.
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'

const seen: Array<Record<string, unknown>> = []
vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => {
    seen.push(props)
    const { href, children, prefetch: _p, ...rest } = props as { href: string; children: React.ReactNode; prefetch?: boolean }
    return React.createElement('a', { href, ...(rest as object) }, children)
  },
}))

import { ActionButton } from '@/components/ui/action-button'

describe('ActionButton links and prefetch', () => {
  it('a new-tab link is not prefetched', () => {
    render(<ActionButton href="/patients/export" target="_blank">Export CSV</ActionButton>)
    const link = seen.find((p) => p.href === '/patients/export')
    expect(link?.prefetch).toBe(false)
    expect(link?.rel).toBe('noopener noreferrer')
  })

  it('an in-app link keeps the router default', () => {
    render(<ActionButton href="/patients">Patients</ActionButton>)
    const link = seen.find((p) => p.href === '/patients')
    expect(link?.prefetch).toBeUndefined()
  })
})

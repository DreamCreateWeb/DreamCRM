/**
 * ML-40 — the clinic page's first-week, support-thread and Guardian cards,
 * and the support peek's tenant scoping.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FirstWeekCard, SupportThreadCard, GuardianNoteCard } from '@/app/(default)/ecommerce/customers/[id]/clinic-standing-cards'

const NOW = new Date('2026-11-09T12:00:00Z')

function fwRow(over: Record<string, unknown> = {}): any {
  return {
    day: 3,
    stage: 'first-week',
    progress: { done: ['a1'], next: 'a2' },
    pmsRequest: null,
    facts: [{ id: 'pms', label: 'PMS', grade: 'ok', summary: 'NexHealth is syncing', href: '/integrations/pms' }],
    doorsUnreadable: false,
    doors: { siteLive: true, switches: ['my_day'], insurance: false, digest: false },
    unreadable: [],
    lastStaffSignInAt: new Date(NOW.getTime() - 3_600_000),
    stuck: [],
    ...over,
  }
}

describe('FirstWeekCard', () => {
  it('shows the day, the PMS answer, the site, the switches and the source', () => {
    render(<FirstWeekCard row={fwRow()} clinicName="Dream Dental" />)
    expect(screen.getByText(/day 3/)).toBeInTheDocument()
    expect(screen.getByText('NexHealth is syncing')).toBeInTheDocument()
    expect(screen.getByText('Live')).toBeInTheDocument()
    expect(screen.getByText('My Day')).toBeInTheDocument()
    expect(screen.getByText(/same row the first-week board shows/)).toBeInTheDocument()
  })

  it('a clinic that asked for a PMS connection says who and what stage', () => {
    render(<FirstWeekCard row={fwRow({ pmsRequest: { vendor: 'Dentrix', status: 'requested', at: NOW } })} clinicName="Dream Dental" />)
    expect(screen.getByText(/Asked us to connect Dentrix \(requested\)/)).toBeInTheDocument()
  })

  it('an unreadable row is said, with a door — never a blank that looks healthy', () => {
    render(<FirstWeekCard row={null} clinicName="Dream Dental" />)
    expect(screen.getByText(/couldn’t read this clinic’s first week/)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /first-week board/i }).length).toBeGreaterThan(0)
  })

  it('names why they are stuck', () => {
    render(<FirstWeekCard row={fwRow({ stuck: ['No staff sign-in for 8 days'] })} clinicName="Dream Dental" />)
    expect(screen.getByText('No staff sign-in for 8 days')).toBeInTheDocument()
  })
})

describe('SupportThreadCard', () => {
  it('shows the last message, who said it ("Support" / "the clinic") and opens the thread', () => {
    render(
      <SupportThreadCard
        unreadable={false}
        peek={{ conversationId: 42, messageCount: 3, last: { body: 'Our hours changed', createdAt: NOW, fromSupport: false } }}
      />,
    )
    expect(screen.getByText(/last from the clinic/)).toBeInTheDocument()
    expect(screen.getByText(/Our hours changed/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open the thread' }).getAttribute('href')).toBe('/messages?c=42')
  })

  it('platform-authored last message reads "Support"', () => {
    render(<SupportThreadCard unreadable={false} peek={{ conversationId: 1, messageCount: 1, last: { body: 'Hi', createdAt: NOW, fromSupport: true } }} />)
    expect(screen.getByText(/last from Support/)).toBeInTheDocument()
  })

  it('no thread yet is an EmptyState with a door', () => {
    render(<SupportThreadCard unreadable={false} peek={null} />)
    expect(screen.getByText(/Nothing in the support thread yet/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open messages' }).getAttribute('href')).toBe('/messages')
  })

  it('an unreadable thread says so', () => {
    render(<SupportThreadCard unreadable peek={null} />)
    expect(screen.getByText(/couldn’t read the support thread/)).toBeInTheDocument()
  })
})

describe('GuardianNoteCard', () => {
  const report: any = {
    clinicName: 'Dream Dental',
    verdict: { state: 'healthy', headline: 'Running normally', why: 'Work every day this week.' },
    signals: { trafficDrop: { total: 100, totalPrev: 400 } },
  }
  it('carries the verdict and the traffic line, and says where it comes from', () => {
    render(<GuardianNoteCard report={report} unreadable={false} />)
    expect(screen.getByText('Running normally')).toBeInTheDocument()
    expect(screen.getByText(/Dream Dental’s site traffic/)).toBeInTheDocument()
    expect(screen.getByText(/activity log and the site’s 7-day traffic/)).toBeInTheDocument()
  })
  it('a blind sweep is not an all-clear', () => {
    render(<GuardianNoteCard report={null} unreadable />)
    expect(screen.getByText(/I couldn’t look just now/)).toBeInTheDocument()
  })
  it('a clinic the Guardian does not watch says why', () => {
    render(<GuardianNoteCard report={null} unreadable={false} />)
    expect(screen.getByText(/isn’t watching this clinic/)).toBeInTheDocument()
  })
})

// ── getSupportThreadPeek: tenant scoping ────────────────────────────────────
const wheres: unknown[] = []
const queue: unknown[][] = []
vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const chain = () => {
    const o: any = {}
    for (const k of ['from', 'innerJoin', 'leftJoin', 'groupBy', 'orderBy']) o[k] = () => o
    o.where = (c: unknown) => {
      wheres.push(c)
      return o
    }
    o.limit = async () => queue.shift() ?? []
    o.then = (res: (v: unknown) => void) => res(queue.shift() ?? [])
    return o
  }
  return { db: { select: () => chain() }, schema }
})

describe('getSupportThreadPeek', () => {
  it('reads only the given clinic\'s thread, never creates, and returns null with no thread', async () => {
    const { getSupportThreadPeek } = await import('@/lib/services/messages')
    wheres.length = 0
    queue.length = 0
    queue.push([]) // no conversation for the org
    expect(await getSupportThreadPeek('org_A')).toBeNull()
    const { PgDialect } = await import('drizzle-orm/pg-core')
    const q = new PgDialect().sqlToQuery(wheres[0] as any)
    expect(q.params).toContain('org_A')
    expect(q.sql).toMatch(/organization_id/)
  })

  it('returns the last message and who wrote it (platform member = Support)', async () => {
    const { getSupportThreadPeek } = await import('@/lib/services/messages')
    queue.length = 0
    queue.push([{ id: 7 }]) // conversation
    // `.limit()` shifts at call time; thenables shift when awaited — so: last, platform, count.
    queue.push([{ body: 'Hello', createdAt: NOW, authorId: 'u_platform' }]) // last
    queue.push([{ userId: 'u_platform' }]) // platform members (awaited synchronously inside its helper)
    queue.push([{ n: 2 }]) // count (a bare thenable, resolved a microtask later)
    const peek = await getSupportThreadPeek('org_B')
    expect(peek).toEqual({ conversationId: 7, messageCount: 2, last: { body: 'Hello', createdAt: NOW, fromSupport: true } })
  })
})

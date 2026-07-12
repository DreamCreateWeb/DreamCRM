import { describe, it, expect } from 'vitest'
import {
  parseTrail,
  pathnameOf,
  prettifySegment,
  recordStop,
  resolveTrailLabel,
  SUBROUTE_LABELS,
  TRAIL_CAP,
  type TrailModule,
  type TrailStop,
} from '@/lib/trail'

/**
 * The journey-trail's core is the pure `recordStop` reducer + `resolveTrailLabel`
 * (lib/trail.ts). These tests are the "thorough + intelligent" guarantee the
 * spec asks for — every record rule + every label-precedence branch.
 */

function stop(pathname: string, url = pathname, label = pathname): TrailStop {
  return { pathname, url, label }
}

// A tiny module registry mirroring the real clinic one's shapes.
const MODULES: TrailModule[] = [
  { path: '/', label: 'Overview' },
  { path: '/patients', label: 'Patients' },
  { path: '/appointments', label: 'Appointments' },
  { path: '/shop', label: 'Shop' },
  { path: '/marketing', label: 'Recall & Outreach' },
  { path: '/reviews', label: 'Reviews' },
]

describe('recordStop — record rules', () => {
  it('pushes a brand-new stop onto an empty trail (first stop)', () => {
    const next = recordStop([], stop('/patients'))
    expect(next).toHaveLength(1)
    expect(next[0].pathname).toBe('/patients')
  })

  it('pushes a new stop with a different pathname', () => {
    const a = stop('/patients')
    const next = recordStop([a], stop('/appointments'))
    expect(next.map((s) => s.pathname)).toEqual(['/patients', '/appointments'])
  })

  it('a filter change (same pathname as top) updates the url, NOT the length', () => {
    const trail = [stop('/patients', '/patients', 'Patients')]
    const next = recordStop(trail, {
      pathname: '/patients',
      url: '/patients?filter=lapsed',
      label: 'Patients',
    })
    expect(next).toHaveLength(1)
    expect(next[0].url).toBe('/patients?filter=lapsed')
    expect(next[0].label).toBe('Patients')
  })

  it('a no-op same-url same-label record returns the SAME array reference', () => {
    const trail = [stop('/patients', '/patients', 'Patients')]
    const next = recordStop(trail, stop('/patients', '/patients', 'Patients'))
    expect(next).toBe(trail)
  })

  it('keeps the existing label on a bare filter change (no label churn)', () => {
    // The top already has an override label; a re-record with the same label
    // must not blow it away.
    const trail = [stop('/patients/p1', '/patients/p1', 'Olivia Lopez')]
    const next = recordStop(trail, {
      pathname: '/patients/p1',
      url: '/patients/p1?tab=billing',
      label: 'Olivia Lopez',
    })
    expect(next[0].label).toBe('Olivia Lopez')
    expect(next[0].url).toBe('/patients/p1?tab=billing')
  })

  it('a meaningfully-different label on the same top stop wins', () => {
    const trail = [stop('/patients/p1', '/patients/p1', 'Patients')]
    const next = recordStop(trail, {
      pathname: '/patients/p1',
      url: '/patients/p1',
      label: 'Olivia Lopez',
    })
    expect(next[0].label).toBe('Olivia Lopez')
  })

  it('loop A→B→A collapses to [A] (truncate to the prior index, inclusive)', () => {
    let trail: TrailStop[] = []
    trail = recordStop(trail, stop('/a'))
    trail = recordStop(trail, stop('/b'))
    trail = recordStop(trail, stop('/a', '/a?back=1'))
    expect(trail.map((s) => s.pathname)).toEqual(['/a'])
    // The url is updated to the latest visit so filter state is restored.
    expect(trail[0].url).toBe('/a?back=1')
  })

  it('A→B→C then revisiting B truncates to [A, B]', () => {
    let trail: TrailStop[] = []
    trail = recordStop(trail, stop('/a'))
    trail = recordStop(trail, stop('/b'))
    trail = recordStop(trail, stop('/c'))
    trail = recordStop(trail, stop('/b', '/b?x=1'))
    expect(trail.map((s) => s.pathname)).toEqual(['/a', '/b'])
    expect(trail[1].url).toBe('/b?x=1')
  })

  it('revisiting an earlier stop keeps its prior label unless a new one is given', () => {
    let trail: TrailStop[] = []
    trail = recordStop(trail, stop('/a', '/a', 'Alpha'))
    trail = recordStop(trail, stop('/b', '/b', 'Bravo'))
    // Re-enter /a with a generic auto-label — the human label "Alpha" persists.
    trail = recordStop(trail, stop('/a', '/a', 'Alpha'))
    expect(trail).toHaveLength(1)
    expect(trail[0].label).toBe('Alpha')
  })

  it('caps the trail at TRAIL_CAP, dropping the oldest', () => {
    let trail: TrailStop[] = []
    // Push 12 distinct stops; only the last TRAIL_CAP (10) survive.
    for (let i = 0; i < TRAIL_CAP + 2; i++) trail = recordStop(trail, stop(`/p${i}`))
    expect(trail).toHaveLength(TRAIL_CAP)
    expect(trail[0].pathname).toBe('/p2') // /p0 and /p1 dropped
    expect(trail[trail.length - 1].pathname).toBe(`/p${TRAIL_CAP + 1}`)
  })

  it('never holds the same pathname twice (implicit dedup via the rules)', () => {
    let trail: TrailStop[] = []
    trail = recordStop(trail, stop('/a'))
    trail = recordStop(trail, stop('/b'))
    trail = recordStop(trail, stop('/c'))
    trail = recordStop(trail, stop('/b'))
    trail = recordStop(trail, stop('/a'))
    const paths = trail.map((s) => s.pathname)
    expect(new Set(paths).size).toBe(paths.length)
  })
})

describe('resolveTrailLabel — precedence', () => {
  it('override wins over everything', () => {
    expect(resolveTrailLabel('/patients/123', MODULES, SUBROUTE_LABELS, 'Olivia Lopez')).toBe(
      'Olivia Lopez',
    )
  })

  it('ignores a blank/whitespace override and falls through', () => {
    expect(resolveTrailLabel('/patients', MODULES, SUBROUTE_LABELS, '   ')).toBe('Patients')
  })

  it('exact subroute map beats the owning module label', () => {
    // /shop/orders is owned by the /shop module ("Shop") but should read "Orders".
    expect(resolveTrailLabel('/shop/orders', MODULES)).toBe('Orders')
    expect(resolveTrailLabel('/growth/reviews/received', MODULES)).toBe('Reviews')
    expect(resolveTrailLabel('/growth/outreach/queue', MODULES)).toBe('Outreach')
    expect(resolveTrailLabel('/inbox', MODULES)).toBe('Mailbox')
  })

  it('the Settings family collapses to "Settings"', () => {
    expect(resolveTrailLabel('/settings/account', MODULES)).toBe('Settings')
    expect(resolveTrailLabel('/settings/billing', MODULES)).toBe('Settings')
    expect(resolveTrailLabel('/settings', MODULES)).toBe('Settings')
  })

  it('longest module prefix wins for a module root', () => {
    expect(resolveTrailLabel('/patients', MODULES)).toBe('Patients')
    expect(resolveTrailLabel('/shop', MODULES)).toBe('Shop')
  })

  it('a detail route resolves to its owning module (/patients/123 → Patients)', () => {
    expect(resolveTrailLabel('/patients/123', MODULES)).toBe('Patients')
    expect(resolveTrailLabel('/appointments/abc', MODULES)).toBe('Appointments')
  })

  it('strips ?search + #hash before resolving', () => {
    expect(resolveTrailLabel('/patients?filter=lapsed', MODULES)).toBe('Patients')
    expect(resolveTrailLabel('/patients/123?tab=billing#notes', MODULES)).toBe('Patients')
  })

  it('the root path "/" resolves to its module (Overview), not a prefix of everything', () => {
    expect(resolveTrailLabel('/', MODULES)).toBe('Overview')
    // "/" must NOT win as a prefix for other paths.
    expect(resolveTrailLabel('/leads', MODULES)).toBe('Leads')
  })

  it('falls back to a prettified last segment when no module/subroute matches', () => {
    expect(resolveTrailLabel('/some/unknown-page', MODULES)).toBe('Unknown page')
    expect(resolveTrailLabel('/widgets', MODULES)).toBe('Widgets')
  })
})

describe('pathnameOf / prettifySegment', () => {
  it('pathnameOf drops search and hash', () => {
    expect(pathnameOf('/a?b=1#c')).toBe('/a')
    expect(pathnameOf('/a')).toBe('/a')
    expect(pathnameOf('/')).toBe('/')
  })

  it('prettifySegment title-cases the last segment, "/" → Home', () => {
    expect(prettifySegment('/')).toBe('Home')
    expect(prettifySegment('/shop/order-history')).toBe('Order history')
    expect(prettifySegment('/foo_bar')).toBe('Foo bar')
  })
})

describe('parseTrail — defensive deserialization', () => {
  it('returns [] for null / invalid JSON / non-array', () => {
    expect(parseTrail(null)).toEqual([])
    expect(parseTrail('not json')).toEqual([])
    expect(parseTrail('{"a":1}')).toEqual([])
  })

  it('filters out malformed entries', () => {
    const raw = JSON.stringify([
      { pathname: '/a', url: '/a', label: 'A' },
      { pathname: '/b' }, // missing url + label
      null,
      { pathname: '/c', url: '/c', label: 'C' },
    ])
    expect(parseTrail(raw).map((s) => s.pathname)).toEqual(['/a', '/c'])
  })

  it('enforces the cap even on tampered storage', () => {
    const many = Array.from({ length: TRAIL_CAP + 5 }, (_, i) => ({
      pathname: `/p${i}`,
      url: `/p${i}`,
      label: `P${i}`,
    }))
    expect(parseTrail(JSON.stringify(many))).toHaveLength(TRAIL_CAP)
  })
})

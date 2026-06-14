import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import type { TrailModule } from '@/lib/trail'

/**
 * TrailProvider integration — drives the provider through real pathname/search
 * changes (mocked next/navigation) and asserts the recorded trail + `previous`
 * + `useTrailLabel`. This proves the A→B→A loop collapse and filter-preserving
 * urls end-to-end, not just at the reducer level.
 */

// Controllable navigation mock. `router.push` mutates the location so the next
// render reflects it (the provider's record effect reconciles via the reducer).
const nav = {
  pathname: '/',
  search: '',
}
const push = vi.fn((url: string) => {
  const [p, q = ''] = url.split('?')
  nav.pathname = p
  nav.search = q
})
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ push }),
}))

import { TrailProvider, useTrail, useTrailLabel } from '@/app/trail-context'

const MODULES: TrailModule[] = [
  { path: '/', label: 'Overview' },
  { path: '/patients', label: 'Patients' },
  { path: '/appointments', label: 'Appointments' },
]

// A probe that exposes the trail state + lets a test trigger back()/goTo().
function Probe({ overrideLabel }: { overrideLabel?: string }) {
  const { trail, previous, back, goTo } = useTrail()
  useTrailLabel(overrideLabel)
  return (
    <div>
      <span data-testid="len">{trail.length}</span>
      <span data-testid="previous">{previous?.label ?? 'none'}</span>
      <span data-testid="top-url">{trail[trail.length - 1]?.url ?? ''}</span>
      <span data-testid="paths">{trail.map((s) => s.pathname).join('>')}</span>
      <span data-testid="labels">{trail.map((s) => s.label).join('>')}</span>
      <button onClick={back}>back</button>
      <button onClick={() => goTo(0)}>goto0</button>
    </div>
  )
}

function renderAt(pathname: string, search = '', probe?: React.ReactNode) {
  nav.pathname = pathname
  nav.search = search
  return render(<TrailProvider modules={MODULES}>{probe ?? <Probe />}</TrailProvider>)
}

beforeEach(() => {
  push.mockClear()
  nav.pathname = '/'
  nav.search = ''
  try {
    window.sessionStorage.clear()
  } catch {
    /* ignore */
  }
})

describe('TrailProvider — recording', () => {
  it('records the landing page as a single stop (no previous → chip stays hidden)', () => {
    renderAt('/patients')
    expect(screen.getByTestId('len').textContent).toBe('1')
    expect(screen.getByTestId('previous').textContent).toBe('none')
    expect(screen.getByTestId('labels').textContent).toBe('Patients')
  })

  it('A→B yields previous = A', () => {
    const { rerender } = renderAt('/patients')
    act(() => {
      nav.pathname = '/appointments'
      nav.search = ''
    })
    rerender(<TrailProvider modules={MODULES}><Probe /></TrailProvider>)
    expect(screen.getByTestId('paths').textContent).toBe('/patients>/appointments')
    expect(screen.getByTestId('previous').textContent).toBe('Patients')
  })

  it('A→B→A collapses to [A] and previous becomes null again', () => {
    const { rerender } = renderAt('/patients')
    const go = (pathname: string, search = '') => {
      act(() => {
        nav.pathname = pathname
        nav.search = search
      })
      rerender(<TrailProvider modules={MODULES}><Probe /></TrailProvider>)
    }
    go('/appointments')
    go('/patients') // loop back
    expect(screen.getByTestId('paths').textContent).toBe('/patients')
    expect(screen.getByTestId('previous').textContent).toBe('none')
  })

  it('a filter change on the same page updates the stored url, not the length', () => {
    const { rerender } = renderAt('/patients')
    act(() => {
      nav.pathname = '/patients'
      nav.search = 'filter=lapsed'
    })
    rerender(<TrailProvider modules={MODULES}><Probe /></TrailProvider>)
    expect(screen.getByTestId('len').textContent).toBe('1')
    expect(screen.getByTestId('top-url').textContent).toBe('/patients?filter=lapsed')
  })

  it('back() pushes the previous stop url (filter-preserving), then reconciles', () => {
    const { rerender } = renderAt('/patients', 'filter=lapsed')
    act(() => {
      nav.pathname = '/appointments'
      nav.search = ''
    })
    rerender(<TrailProvider modules={MODULES}><Probe /></TrailProvider>)
    // Now on /appointments with previous = Patients (its filtered url stored).
    fireEvent.click(screen.getByText('back'))
    expect(push).toHaveBeenCalledWith('/patients?filter=lapsed')
    // The mocked push moved the location; reconcile by re-rendering.
    rerender(<TrailProvider modules={MODULES}><Probe /></TrailProvider>)
    expect(screen.getByTestId('paths').textContent).toBe('/patients')
  })

  it('persists the trail to sessionStorage under dc.trail', () => {
    const { rerender } = renderAt('/patients')
    act(() => {
      nav.pathname = '/appointments'
    })
    rerender(<TrailProvider modules={MODULES}><Probe /></TrailProvider>)
    const raw = window.sessionStorage.getItem('dc.trail')
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw!).map((s: { pathname: string }) => s.pathname)).toEqual([
      '/patients',
      '/appointments',
    ])
  })
})

describe('useTrailLabel — override the current stop', () => {
  it('overrides the top stop label (so the chip reads the entity name)', () => {
    // Land on a detail route; the registry would auto-label it "Patients",
    // but the probe overrides it to a patient name.
    renderAt('/patients/p1', '', <Probe overrideLabel="Olivia Lopez" />)
    expect(screen.getByTestId('labels').textContent).toBe('Olivia Lopez')
  })

  it('the overridden label survives into `previous` after navigating away', () => {
    const { rerender } = renderAt('/patients/p1', '', <Probe overrideLabel="Olivia Lopez" />)
    act(() => {
      nav.pathname = '/appointments'
      nav.search = ''
    })
    // After leaving, no override applies on the new page.
    rerender(<TrailProvider modules={MODULES}><Probe /></TrailProvider>)
    expect(screen.getByTestId('previous').textContent).toBe('Olivia Lopez')
  })
})

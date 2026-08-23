import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TeamStatusBand from '@/app/(default)/dream-team/team-status-band'

/**
 * THE OPENING BEAT (docs/ai-operations.md, D7). The band answers the question
 * a person arrives with — *is anything happening?* — before the page asks
 * anything of them. Its laws: every number is real, zero is said plainly,
 * and a number with nowhere to go is never dressed as a link.
 */

function band(over: Partial<Parameters<typeof TeamStatusBand>[0]> = {}) {
  return (
    <TeamStatusBand
      waiting={0}
      staged={0}
      handledLastWeek={0}
      weekLabel={null}
      activeGoals={0}
      {...over}
    />
  )
}

describe('the Dream Team status band', () => {
  it('leads with what waits on a person, in their own count', () => {
    render(band({ waiting: 3 }))
    expect(screen.getByText('3 things are finished and waiting on you.')).toBeTruthy()
    expect(screen.getByText('waiting on you')).toBeTruthy()
  })

  it('speaks singular for one', () => {
    render(band({ waiting: 1 }))
    expect(screen.getByText('One thing is finished and waiting on you.')).toBeTruthy()
  })

  it('says a calm desk plainly when nothing waits and nothing is queued', () => {
    render(band({ lastCycle: 'an hour ago' }))
    expect(screen.getByText('Nothing needs you right now.')).toBeTruthy()
  })

  it('a FIRST visit says the team is settling in — "nothing needs you" would read as an empty page', () => {
    render(band())
    expect(screen.getByText('Your team is settling in — nothing has needed you yet.')).toBeTruthy()
  })

  it('reports queued work when the desk is clear but the runway is not', () => {
    render(band({ staged: 2 }))
    expect(screen.getByText('Nothing needs you — work is queued and going out.')).toBeTruthy()
  })

  it('links the two numbers that HAVE a section, and only when non-zero', () => {
    const { container } = render(band({ waiting: 2, staged: 1, handledLastWeek: 9 }))
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('#sign-here')
    expect(hrefs).toContain('#going-out-soon')
    // "Handled last week" has no ledger page to land on — a dead link reads
    // as a broken page, so it stays plain text.
    expect(hrefs.filter(Boolean)).toHaveLength(2)
  })

  it('never links a zero — there would be nothing to see', () => {
    const { container } = render(band({ waiting: 0, staged: 0, handledLastWeek: 4 }))
    expect(container.querySelectorAll('a')).toHaveLength(0)
  })

  it('names the week the handled number covers when the standup knows it', () => {
    render(band({ handledLastWeek: 12, weekLabel: 'May 10 – May 16' }))
    expect(screen.getByText('handled May 10 – May 16')).toBeTruthy()
    expect(screen.getByText('12')).toBeTruthy()
  })

  it('falls back to a plain label when the standup could not be read', () => {
    render(band({ handledLastWeek: 5, weekLabel: null }))
    expect(screen.getByText('handled last week')).toBeTruthy()
  })

  it('shows the heartbeat by name — "on the clock" is decoration without it', () => {
    render(band({ lastCycle: '12 minutes ago' }))
    expect(screen.getByText('· last cycle 12 minutes ago')).toBeTruthy()
  })

  it('says the first cycle is coming rather than implying one already ran', () => {
    render(band())
    expect(screen.getByText('· first cycle hasn’t run yet')).toBeTruthy()
  })

  it('tells a practice with no goals how to point the team, and reports the count when they have', () => {
    const { unmount } = render(band())
    expect(screen.getByText(/Tell them what you want more of/)).toBeTruthy()
    unmount()
    render(band({ activeGoals: 2 }))
    expect(screen.getByText('Pointed at your 2 goals below.')).toBeTruthy()
  })
})

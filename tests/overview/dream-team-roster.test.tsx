import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TeamRoster from '@/app/(default)/dream-team/team-roster'
import { SPECIALISTS } from '@/lib/types/dream-team'
import { CAPABILITIES } from '@/lib/autonomy'

/**
 * THE ROSTER (docs/ai-operations.md, D3). Contract: a report, not a
 * console — real last-week numbers, honest quiet weeks, and the
 * registry-parity guard so a new capability can't silently miss the team.
 */

describe('the roster ↔ capability registry parity', () => {
  it('every specialist capability is a real registered capability', () => {
    const known = new Set(CAPABILITIES.map((c) => c.key))
    for (const s of SPECIALISTS) {
      for (const c of s.capabilities) {
        expect(known.has(c), `${s.id} lists unknown capability ${c}`).toBe(true)
      }
    }
  })

  it('no capability sits on two specialists, and only the meta lanes sit on none', () => {
    const seen = new Map<string, string>()
    for (const s of SPECIALISTS) {
      for (const c of s.capabilities) {
        expect(seen.has(c), `${c} is on both ${seen.get(c)} and ${s.id}`).toBe(false)
        seen.set(c, s.id)
      }
    }
    // The deliberate absences: the meta lanes (how work reaches the clinic /
    // the watcher's own voice) and the one-time setup asks — first-week
    // questions, not standing jobs on anyone's desk.
    const META = new Set([
      'guardian_note',
      'proposal_engine',
      'setup_hours',
      'setup_chairs',
      'setup_booking_mode',
      'setup_texting',
    ])
    for (const c of CAPABILITIES) {
      if (META.has(c.key)) {
        expect(seen.has(c.key), `${c.key} is meta — keep it off the roster`).toBe(false)
      } else {
        expect(seen.has(c.key), `${c.key} is on no specialist — add it to the roster`).toBe(true)
      }
    }
  })
})

describe('the roster cards', () => {
  it('shows every specialist with real last-week counts, and says a quiet week plainly', () => {
    render(
      <TeamRoster
        grantedCapabilities={new Set()}
        weeklyCounts={
          new Map([
            ['appointment_reminder', 12],
            ['review_request', 3],
          ])
        }
        waitingCapabilities={new Set()}
      />,
    )
    expect(screen.getByText('Scheduling')).toBeInTheDocument()
    expect(screen.getByText('Reputation')).toBeInTheDocument()
    // Scheduling: 12 reminders → "12 things handled last week".
    expect(screen.getByText('12')).toBeInTheDocument()
    // A lane with zero work says so — it must never look busy (Guardian law).
    expect(screen.getAllByText(/A quiet week — nothing to report\./).length).toBeGreaterThan(0)
  })

  it('a granted ask-first capability moves to the on-their-own line', () => {
    render(
      <TeamRoster
        grantedCapabilities={new Set(['review_reply'])}
        weeklyCounts={new Map()}
        waitingCapabilities={new Set()}
      />,
    )
    // review_reply defaults ask-first; the grant moves it. The Reputation
    // card's on-their-own line must now include it.
    const chips = screen.getAllByText('Reply to Google reviews')
    expect(chips.length).toBeGreaterThan(0)
    // …and no card renders a control for it: the roster reports, the
    // grants strip owns take-it-back.
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('a waiting card surfaces as the specialist’s warn pill', () => {
    render(
      <TeamRoster
        grantedCapabilities={new Set()}
        weeklyCounts={new Map()}
        waitingCapabilities={new Set(['social_post', 'content_plan'])}
      />,
    )
    expect(screen.getByText('2 waiting on you')).toBeInTheDocument()
  })
})

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TeamRoster from '@/app/(default)/dream-team/team-roster'
import { SPECIALISTS } from '@/lib/types/dream-team'
import { CAPABILITIES, SETUP_CAPABILITIES } from '@/lib/autonomy'
import type { ReadinessFact } from '@/lib/readiness'

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
    // The setup list is the registry's own (ML-11): a new first-week ask
    // joins SETUP_CAPABILITIES and stays off the roster by construction.
    const META = new Set([
      'guardian_note',
      'proposal_engine',
      // ML-32: how a bell alert's email copy reaches the clinic — plumbing
      // that only reports to staff, not a job on any specialist's desk.
      'staff_alert',
      ...SETUP_CAPABILITIES,
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

describe('PREVIEW lanes', () => {
  it('the insurance lane (the first preview, released 2026-10-03) shows to every clinic', () => {
    render(<TeamRoster grantedCapabilities={new Set()} weeklyCounts={new Map()} waitingCapabilities={new Set()} />)
    expect(screen.getByText(/insurance benefits/)).toBeInTheDocument()
  })

  it('the generator lane (ML-11) stays off a clinic’s roster until its generator lands — platform admins see it coming', () => {
    const { unmount } = render(
      <TeamRoster grantedCapabilities={new Set()} weeklyCounts={new Map()} waitingCapabilities={new Set()} />,
    )
    // A registration is not a promise: no clinic reads about a job nobody does yet.
    // (patient_reply was the first key released — ML-12 — feedback_reply the
    // second — ML-21 — inquiry_followup the third — ML-22 — and the post-op
    // check-in + aftercare note the fourth and fifth — ML-28 — so all of
    // those now show to all; the referral ask the seventh — ML-39 — so it shows to all too.)
    expect(screen.getByText('Reply to patient messages')).toBeInTheDocument()
    expect(screen.getByText('Answer private feedback')).toBeInTheDocument()
    expect(screen.getByText('Follow up on unanswered inquiries')).toBeInTheDocument()
    expect(screen.getByText('Check in after a procedure')).toBeInTheDocument()
    expect(screen.getByText('Send after-visit care instructions')).toBeInTheDocument()
    expect(screen.getByText('Ask happy patients for referrals')).toBeInTheDocument()
    // ML-35: the listing watch is the sixth released lane — shown to all.
    expect(screen.getByText('Watch your Google listing for changes')).toBeInTheDocument()
    expect(screen.queryByText('Send a monthly patient newsletter')).not.toBeInTheDocument()
    unmount()
    render(
      <TeamRoster grantedCapabilities={new Set()} weeklyCounts={new Map()} waitingCapabilities={new Set()} showPreview />,
    )
    // Still-preview lanes (the newsletter) appear only for platform admins.
    expect(screen.getByText('Send a monthly patient newsletter')).toBeInTheDocument()
  })
})

/**
 * BLOCKED vs QUIET (G1-4): a specialist whose lanes read from a connection
 * the practice hasn't made says what it needs, as a LINK to that door —
 * a report naming its cause, never a control.
 */
describe('what a quiet teammate is waiting on', () => {
  const fact = (
    id: ReadinessFact['id'],
    label: string,
    grade: ReadinessFact['grade'],
    href: string,
  ): ReadinessFact => ({ id, label, grade, summary: 'why it matters', href, optional: false })

  it('a quiet lane with a missing connection renders "Needs {fact.label} →" as a link to the fact’s own door', () => {
    render(
      <TeamRoster
        grantedCapabilities={new Set()}
        weeklyCounts={new Map()}
        waitingCapabilities={new Set()}
        readinessFacts={[
          fact('gbp', 'Connect Google Business', 'todo', '/integrations'),
          fact('pms', 'Practice software connected', 'waiting', '/integrations'),
          fact('social', 'Social connected', 'ready', '/growth/social'),
          fact('patients', 'Add your first patients', 'todo', '/patients'),
        ]}
      />,
    )
    const gbp = screen.getByRole('link', { name: 'Needs Connect Google Business →' })
    expect(gbp).toHaveAttribute('href', '/integrations')
    // Scheduling AND Outreach both wait on patients — one link each.
    expect(screen.getAllByRole('link', { name: 'Needs Add your first patients →' })).toHaveLength(2)
    // Ready blocks nothing; waiting is the practice's part already done.
    expect(screen.queryByText(/Needs Social connected/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Needs Practice software connected/)).not.toBeInTheDocument()
    // The lanes with no need, and the ones not blocked, still say the quiet week plainly.
    expect(screen.getAllByText(/A quiet week — nothing to report\./).length).toBeGreaterThan(0)
    // Still a report, not a console.
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('a teammate with real numbers is working, whatever the setup report says', () => {
    render(
      <TeamRoster
        grantedCapabilities={new Set()}
        weeklyCounts={new Map([['review_request', 3]])}
        waitingCapabilities={new Set()}
        readinessFacts={[fact('gbp', 'Connect Google Business', 'todo', '/integrations')]}
      />,
    )
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.queryByText(/Needs Connect Google Business/)).not.toBeInTheDocument()
  })

  it('an unreadable report blocks no one — the quiet week is said plainly, never a guessed cause', () => {
    render(
      <TeamRoster
        grantedCapabilities={new Set()}
        weeklyCounts={new Map()}
        waitingCapabilities={new Set()}
        readinessFacts={null}
      />,
    )
    expect(screen.queryByText(/^Needs /)).not.toBeInTheDocument()
    expect(screen.getAllByText(/A quiet week — nothing to report\./).length).toBe(6)
  })
})

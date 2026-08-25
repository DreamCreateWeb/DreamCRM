import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { writeFileSync, mkdirSync } from 'node:fs'
import { ToastProvider } from '@/components/ui/toast'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'

/**
 * THE SCREENSHOT FIXTURE (D21) — not a test of behavior, a RENDER RIG.
 *
 * The owner's design directive: "take screenshots and actually look at it
 * as you design it." The prod database is VPC-private, so the app cannot be
 * logged into from this container — but the page's whole DOM can be built
 * the same way the whole-DOM suites build it (real components, mocked
 * service reads), dumped to HTML, dressed in the REAL built Tailwind chunk,
 * and screenshotted with the preinstalled Chromium.
 *
 * Gated on SCREENSHOT=1 so the ordinary full suite never runs it. Data
 * below deliberately mirrors the owner's screenshot of the live demo org:
 * a 4-piece month plan as the focal card, four more cards behind it, two
 * runway items, a demo grant with a week of autonomous work, one active
 * goal, and real-shaped roster counts.
 */

const NOW = Date.now()
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

const planItems = [
  {
    kind: 'social',
    title: null,
    body: 'Brushing gets the credit, but flossing does the quiet work — it reaches the third of each tooth a brush never touches. Two minutes tonight is enough to make a difference by your next cleaning.',
  },
  {
    kind: 'blog',
    title: 'What actually happens at your first visit',
    body: 'Most people put off a first dental visit because they don’t know what they’re walking into. Here’s the whole thing, start to finish — what we look at, what we ask, and what you leave with.',
  },
  {
    kind: 'social',
    title: null,
    body: 'If dental work makes you anxious, tell us before you sit down — not after. We can go slower, explain each step, and stop whenever you raise a hand. It changes the whole appointment.',
  },
  {
    kind: 'social',
    title: null,
    body: 'A cleaning every six months isn’t about a perfect smile — it’s about catching the small stuff while it’s still small. Most of what we treat early would have been a much bigger day a year later.',
  },
]

const proposals = [
  {
    id: 'prop_plan',
    capability: 'content_plan',
    capabilityLabel: 'Plan a month of posts & articles',
    patientId: null,
    title: 'Four weeks of posts and an article, ready to schedule',
    body: planItems[0].body,
    payload: { items: planItems, accountIds: ['acc_ig', 'acc_fb', 'acc_gbp'] },
    status: 'open',
    createdAt: new Date(NOW - 20 * HOUR),
    expiresAt: new Date(NOW + 5 * DAY),
  },
  {
    id: 'prop_review',
    capability: 'review_reply',
    capabilityLabel: 'Reply to Google reviews',
    patientId: null,
    title: 'Answer Maria’s 5-star review',
    body: 'Thank you, Maria — that first visit means a lot to us, and we’re glad the little ones left smiling. See you all in the spring!',
    payload: {
      context: {
        kind: 'review',
        author: 'Maria Lopez',
        starRating: 5,
        text: 'Brought both kids in for their first checkup and the whole team made it feel easy. Best dentist experience we have had.',
      },
    },
    status: 'open',
    createdAt: new Date(NOW - 26 * HOUR),
    expiresAt: new Date(NOW + 30 * HOUR),
  },
  {
    id: 'prop_inquiry',
    capability: 'inquiry_response',
    capabilityLabel: 'Answer website inquiries',
    patientId: null,
    title: 'Answer Rob’s website inquiry',
    body: 'Hi Rob — yes, we have Saturday morning openings this month. Pick a time below, or call us and we’ll find one that fits.',
    payload: {
      subject: 'Saturday appointments at Dream Dental',
      context: { kind: 'inquiry', author: 'Rob Chen', text: 'Do you do Saturday appointments? Weekdays are impossible with my schedule.', preferredDate: 'Saturday' },
    },
    status: 'open',
    createdAt: new Date(NOW - 9 * HOUR),
    expiresAt: new Date(NOW + 3 * DAY),
  },
  {
    id: 'prop_social',
    capability: 'social_post',
    capabilityLabel: 'Publish social & Google posts',
    patientId: null,
    title: 'A post about sensitive teeth, ready to go',
    body: 'Cold-water wince? Sensitive teeth are usually a small fix, not a big one — and ignoring them is the only way they get worse. Mention it at your next visit; it takes us five minutes to check.',
    payload: { accountIds: ['acc_ig', 'acc_fb'], channels: [{ label: 'Instagram' }, { label: 'Facebook' }] },
    status: 'open',
    createdAt: new Date(NOW - 5 * HOUR),
    expiresAt: new Date(NOW + 6 * DAY),
  },
  {
    id: 'prop_recall',
    capability: 'outreach_campaign',
    capabilityLabel: 'Send recall & win-back campaigns',
    patientId: null,
    title: 'Invite 41 overdue patients back',
    body: 'Hi {{firstName}} — it’s been a while since your last visit, and a quick checkup now beats a long one later. Tap below and pick a time that works.',
    payload: { subject: 'Time for a quick checkup, {{firstName}}?', recipientCount: 41 },
    status: 'open',
    createdAt: new Date(NOW - 2 * DAY),
    expiresAt: new Date(NOW + 4 * DAY),
  },
]

vi.mock('@/lib/services/proposals', () => ({
  listOpenProposals: vi.fn(async () => proposals),
  countOpenProposals: vi.fn(async () => proposals.length),
  countConsecutiveUneditedApprovals: vi.fn(async (_org: string, cap: string) =>
    cap === 'review_reply' ? 3 : 0,
  ),
  machineHandlesCardRow: (
    granted: Array<{ capability: string; grantedAt: Date | null }>,
    card: { capability: string; createdAt: Date; handedBack?: boolean },
  ) => {
    if (card.handedBack) return false
    const g = granted.find((x) => x.capability === card.capability)
    if (!g) return false
    return g.grantedAt == null || card.createdAt >= g.grantedAt
  },
}))
vi.mock('@/lib/services/proposal-generators', () => ({
  insidePatientSendWindow: () => true,
  PATIENT_INBOX_CAPABILITIES: ['outreach_campaign', 'inquiry_response', 'schedule_gap'],
}))
vi.mock('@/lib/services/autonomy', () => ({
  listTrustGrants: vi.fn(async () => [
    {
      capability: 'social_post',
      label: 'Publish social & Google posts',
      level: 'auto',
      grantedAt: new Date(NOW - 10 * DAY),
      revokedAt: null,
      explicit: false,
    },
    {
      capability: 'content_plan',
      label: 'Plan a month of posts & articles',
      level: 'auto',
      grantedAt: null,
      revokedAt: null,
      explicit: false,
    },
  ]),
  listAutonomousWork: vi.fn(async () => [
    {
      capability: 'social_post',
      label: 'Publish social & Google posts',
      count: 2,
      latestSummary: 'Posted “Behind the smiles” to Instagram and Facebook',
      summaries: [
        'Posted “Behind the smiles” to Instagram and Facebook',
        'Posted the Saturday-hours reminder to your Google listing',
      ],
    },
  ]),
}))
vi.mock('@/lib/services/standup', () => ({
  buildWeeklyStandup: vi.fn(async () => ({
    weekStart: new Date(NOW - 9 * DAY),
    weekEnd: new Date(NOW - 2 * DAY),
    weekLabel: 'Aug 18 – Aug 24',
    totalActions: 13,
    lines: [
      { capability: 'appointment_reminder', noun: 'appointment reminders', count: 6 },
      { capability: 'review_request', noun: 'review invitations', count: 3 },
      { capability: 'inquiry_response', noun: 'inquiry replies', count: 2 },
      { capability: 'social_post', noun: 'social posts', count: 1 },
      { capability: 'balance_reminder', noun: 'balance nudges', count: 1 },
    ],
    stories: [],
    newPatientsSeated: 4,
    reviewsReceived: 2,
    humanTasks: { openProposals: 5, followupsDue: 2 },
    quiet: false,
    quietNote: null,
    predatesAccount: false,
  })),
}))
vi.mock('@/lib/services/clinic-timezone', () => ({
  getClinicTimeZone: vi.fn(async () => 'America/Chicago'),
}))
vi.mock('@/lib/services/dream-team', () => ({
  countRunway: vi.fn(async () => 2),
  listRunway: vi.fn(async () => [
    {
      kind: 'social',
      id: 'sp_1',
      excerpt: 'Behind the smiles 🦷 A peek at the team that makes every visit feel easy…',
      destination: 'Instagram, Facebook',
      goesOutAt: new Date(NOW + 18 * HOUR),
    },
    {
      kind: 'blog',
      id: 'bp_1',
      excerpt: 'Free Kids’ Smile Day — bring the little ones for a no-cost checkup, balloons included',
      destination: 'your blog',
      goesOutAt: new Date(NOW + 42 * HOUR),
    },
  ]),
  getLastCycleAt: vi.fn(async () => new Date(NOW - 33 * 60 * 1000)),
}))
vi.mock('@/lib/services/goals', () => ({
  listGoals: vi.fn(async () => [
    {
      id: 'goal_1',
      objective: 'more implant patients',
      serviceFocus: 'dental-implants',
      status: 'active',
      baselineNewPatients: 0,
      baselineAt: new Date(NOW - 23 * DAY),
      createdAt: new Date(NOW - 23 * DAY),
    },
  ]),
  seatedSince: vi.fn(async () => 29),
}))
vi.mock('@/app/(default)/dashboard/actions', () => ({
  approveProposalAction: vi.fn(async () => ({ ok: true, message: 'Done.' })),
  declineProposalAction: vi.fn(async () => ({ ok: true, message: 'Okay.' })),
  setAutonomyAction: vi.fn(async () => ({ ok: true, message: 'Done.' })),
}))
vi.mock('next/navigation', async (orig) => ({
  ...(await orig()),
  useRouter: () => ({ refresh: vi.fn() }),
}))

import DreamTeamView from '@/app/(default)/dream-team/dream-team-view'
import type { TenantContext } from '@/lib/auth/context'

const ctx: TenantContext = {
  userId: 'u_1',
  userEmail: 'a@b.com',
  userName: 'Test',
  platformAdmin: false,
  organizationId: 'org_1',
  organizationName: 'Dream Dental Demo',
  organizationSlug: 'acme-dental-demo',
  tenantType: 'clinic',
  role: 'owner',
  planTier: 'premium',
  patientId: null,
  isDemo: true,
} as TenantContext

describe.runIf(process.env.SCREENSHOT === '1')('screenshot fixture', () => {
  it('dumps the Dream Team page DOM for the screenshot rig', async () => {
    const ui = await DreamTeamView({ ctx })
    const { container } = render(
      <ConfirmProvider>
        <ToastProvider>{ui}</ToastProvider>
      </ConfirmProvider>,
    )
    const dir = process.env.SCREENSHOT_DIR ?? '/tmp/dt-shot'
    mkdirSync(dir, { recursive: true })
    writeFileSync(`${dir}/body.html`, container.innerHTML)
    expect(container.innerHTML.length).toBeGreaterThan(5000)
  })
})

/**
 * SANDMAN — the Dream Team's chief of staff (docs/ai-operations.md, D5).
 * One conversation surface over the clinic's own numbers: "how many patients
 * did we see last month?", "why fewer this month?", "so what should we do?"
 *
 * Pure module (no server-only deps) so the chat panel, the prompt builder,
 * and the tests share one contract.
 *
 * THE GUARD RAIL, inherited from the prospecting copilot and hardened for a
 * clinic tenant: Sandman NEVER executes. It answers grounded in a snapshot
 * and may SUGGEST from a closed, enumerated registry of NAVIGATIONS — the
 * human clicks. Nothing it can say sends mail, posts publicly, or grants
 * autonomy; a misread "email everyone" cannot fire.
 *
 * THE PRIVACY LINE (the shared brain's law, applied here): the snapshot
 * carries AGGREGATES ONLY. No patient names, no addresses, no visit rows —
 * counts and rates cross into the model, people never do.
 */

export type SandmanActionKind =
  | 'open_dream_team'
  | 'open_runway'
  | 'open_reviews'
  | 'open_social'
  | 'open_outreach'
  | 'open_analytics'
  | 'open_website'
  | 'open_appointments'
  | 'open_patients'
  | 'open_integrations'

export interface SandmanActionDef {
  kind: SandmanActionKind
  label: string
  href: string
  /** One-line hint the prompt shows the model so it suggests the right one. */
  when: string
}

export const SANDMAN_ACTIONS: Record<SandmanActionKind, SandmanActionDef> = {
  open_dream_team: {
    kind: 'open_dream_team',
    label: 'See what’s waiting',
    href: '/dream-team',
    when: 'work is waiting on their yes and they should look at it',
  },
  open_runway: {
    kind: 'open_runway',
    label: 'See what’s going out',
    href: '/dream-team#going-out-soon',
    when: 'they ask what is queued, or should check something before it goes out',
  },
  open_reviews: {
    kind: 'open_reviews',
    label: 'Open reviews',
    href: '/growth/reviews',
    when: 'the question is about reviews, ratings, or replying to a reviewer',
  },
  open_social: {
    kind: 'open_social',
    label: 'Open social',
    href: '/growth/social',
    when: 'the question is about posts, channels, or social reach',
  },
  open_outreach: {
    kind: 'open_outreach',
    label: 'Open recall & outreach',
    href: '/growth/outreach',
    when: 'the question is about recall, win-backs, campaigns, or bringing patients back',
  },
  open_analytics: {
    kind: 'open_analytics',
    label: 'Open analytics',
    href: '/growth/analytics',
    when: 'they want the fuller picture behind a number',
  },
  open_website: {
    kind: 'open_website',
    label: 'Open your website',
    href: '/website',
    when: 'the question is about the site, its pages, booking, or SEO',
  },
  open_appointments: {
    kind: 'open_appointments',
    label: 'Open the schedule',
    href: '/appointments',
    when: 'the question is about the schedule, openings, or confirmations',
  },
  open_patients: {
    kind: 'open_patients',
    label: 'Open patients',
    href: '/patients',
    when: 'the question is about the patient list itself',
  },
  open_integrations: {
    kind: 'open_integrations',
    label: 'Open integrations',
    href: '/integrations',
    when: 'something is not connected and connecting it is the real answer',
  },
}

export const SANDMAN_ACTION_KINDS = Object.keys(SANDMAN_ACTIONS) as SandmanActionKind[]

export interface SandmanSuggestedAction {
  kind: SandmanActionKind
  label: string
}

export interface SandmanResponse {
  answer: string
  actions: SandmanSuggestedAction[]
}

/** AGGREGATES ONLY — see the privacy line above. */
export interface SandmanSnapshot {
  clinicName: string
  /** New patients SEATED, by month (the journey law: seated, not booked). */
  newPatients: { thisMonth: number; lastMonth: number; perWeek12: number[] }
  schedule: {
    todayBooked: number
    upcomingNext7d: number
    unconfirmedNext48h: number
    openChairsNext7d: number | null
  }
  recall: {
    dueReachable: number
    sentLast30d: number
    openedLast30d: number
    bookedBackLast30d: number
  }
  reviews: { rating: number | null; total: number; received30d: number; needingReply: number }
  content: { posts30d: number; articles30d: number; queued: number }
  inquiries: { new30d: number; untouched: number }
  /** What the team did last week, per lane (the standup's ledger lines). */
  lastWeek: Array<{ noun: string; count: number }>
  /** Work waiting on a human right now. */
  waiting: number
  /** Lanes running on their own. */
  autoLanes: string[]
  /** Connection gaps that make a whole answer impossible ("social isn't connected"). */
  gaps: string[]
}

function n(v: number | null | undefined): string {
  return v == null ? 'unknown' : String(v)
}

/** Render the snapshot as a terse, model-legible fact block. */
export function renderSandmanSnapshot(s: SandmanSnapshot): string {
  const lines: string[] = []
  lines.push(`PRACTICE: ${s.clinicName}`)
  lines.push('')
  lines.push('NEW PATIENTS (seated — the number that counts):')
  lines.push(`- this month so far: ${s.newPatients.thisMonth} · same point last month: ${s.newPatients.lastMonth}`)
  if (s.newPatients.perWeek12.length > 0) {
    lines.push(`- last 12 weeks, oldest→newest: ${s.newPatients.perWeek12.join(', ')}`)
  }
  lines.push('')
  lines.push('SCHEDULE:')
  lines.push(
    `- booked today ${s.schedule.todayBooked} · next 7 days ${s.schedule.upcomingNext7d} · unconfirmed in 48h ${s.schedule.unconfirmedNext48h} · open slots next 7 days ${n(s.schedule.openChairsNext7d)}`,
  )
  lines.push('')
  lines.push('RECALL (bringing patients back), last 30 days:')
  lines.push(
    `- due and reachable ${s.recall.dueReachable} · invited ${s.recall.sentLast30d} · opened ${s.recall.openedLast30d} · booked back ${s.recall.bookedBackLast30d}`,
  )
  lines.push('')
  lines.push('REPUTATION:')
  lines.push(
    `- rating ${n(s.reviews.rating)} from ${s.reviews.total} reviews · ${s.reviews.received30d} new in 30 days · ${s.reviews.needingReply} awaiting a reply`,
  )
  lines.push('')
  lines.push('CONTENT (last 30 days):')
  lines.push(
    `- social posts published ${s.content.posts30d} · articles published ${s.content.articles30d} · queued to go out ${s.content.queued}`,
  )
  lines.push('')
  lines.push('INQUIRIES (website):')
  lines.push(`- new in 30 days ${s.inquiries.new30d} · still untouched ${s.inquiries.untouched}`)
  lines.push('')
  if (s.lastWeek.length > 0) {
    lines.push('WHAT THE TEAM DID LAST WEEK:')
    for (const l of s.lastWeek.slice(0, 8)) lines.push(`- ${l.count} ${l.noun}`)
    lines.push('')
  }
  lines.push(`WAITING ON A HUMAN RIGHT NOW: ${s.waiting}`)
  lines.push(
    `LANES RUNNING WITHOUT ASKING: ${s.autoLanes.length > 0 ? s.autoLanes.join(', ') : 'none — everything asks first'}`,
  )
  if (s.gaps.length > 0) {
    lines.push('')
    lines.push('NOT CONNECTED (say so plainly if it explains a gap):')
    for (const g of s.gaps) lines.push(`- ${g}`)
  }
  return lines.join('\n')
}

/** Build the system + user prompt. Pure + unit-testable. */
export function buildSandmanPrompt(
  snapshot: SandmanSnapshot,
  query: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
): { system: string; messages: Array<{ role: 'user' | 'assistant'; content: string }> } {
  const actionMenu = SANDMAN_ACTION_KINDS.map(
    (k) => `- ${k}: ${SANDMAN_ACTIONS[k].label} — suggest when ${SANDMAN_ACTIONS[k].when}`,
  ).join('\n')
  const system = [
    `You are Sandman, the chief of staff for ${snapshot.clinicName}'s Dream Team — the AI staff that works this dental practice's marketing and follow-up around the clock. You are talking to the practice's own staff.`,
    'Answer using ONLY the snapshot below — it is their live data. Never invent numbers, names, or history. If the snapshot cannot answer, say so plainly and say what you would need.',
    'HONESTY ABOUT CAUSE: when they ask WHY a number moved, state what actually differs between the periods and call it what it is — a correlation, not a proven cause. "The stronger month had 6 posts and 2 recall sends; this month has 1 and 0" is right. "Posting more caused it" is not.',
    'NEVER discuss an individual patient — you only ever see counts. If asked about one person, say that and point them at the patient record.',
    'Voice: warm, plain, direct, brief (2–4 sentences). Talk like a sharp practice manager, never a chatbot. No exclamation marks, no hype, no shame — a quiet month is a fact, not a failing.',
    'You do NOT perform actions and never claim you did. When a place to look would help, SUGGEST it from this closed menu; the person clicks:',
    actionMenu,
    'Return at most 3 actions, most useful first, and none if none fit. The answer must stand on its own — the buttons are a convenience.',
    '',
    'SNAPSHOT:',
    renderSandmanSnapshot(snapshot),
  ].join('\n')
  const messages = [
    ...history.slice(-6).map((m) => ({ role: m.role, content: m.content.slice(0, 1500) })),
    { role: 'user' as const, content: query.slice(0, 2000) },
  ]
  return { system, messages }
}

/** Tolerant parse of the model's tool output → a safe SandmanResponse.
 *  Drops unknown/duplicate kinds, clamps to 3, never throws. */
export function parseSandmanResponse(raw: unknown): SandmanResponse | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const answer = typeof r.answer === 'string' ? r.answer.trim() : ''
  if (answer.length === 0) return null
  const seen = new Set<string>()
  const actions: SandmanSuggestedAction[] = []
  if (Array.isArray(r.actions)) {
    for (const a of r.actions) {
      if (!a || typeof a !== 'object') continue
      const kind = (a as Record<string, unknown>).kind
      if (typeof kind !== 'string' || !(kind in SANDMAN_ACTIONS) || seen.has(kind)) continue
      seen.add(kind)
      const def = SANDMAN_ACTIONS[kind as SandmanActionKind]
      const rawLabel = (a as Record<string, unknown>).label
      const label =
        typeof rawLabel === 'string' && rawLabel.trim().length > 0
          ? rawLabel.trim().slice(0, 60)
          : def.label
      actions.push({ kind: def.kind, label })
      if (actions.length >= 3) break
    }
  }
  return { answer: answer.slice(0, 1500), actions }
}

/** The opening prompts the panel offers — plain questions a front desk has. */
export const SANDMAN_SUGGESTIONS = [
  'How are we doing on new patients this month?',
  'Why are we seeing fewer patients than last month?',
  'What should we do this week to bring more in?',
  'What have you handled on your own lately?',
  'Is anything waiting on me?',
]

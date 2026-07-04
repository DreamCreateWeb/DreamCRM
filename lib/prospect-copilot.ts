// The hunt copilot — a natural-language command bar over the prospecting
// engine. Pure module (no server-only deps) so the client bar and the tests
// can import the contract, the action registry, and the tolerant parser.
//
// Design guard rail: the AI never EXECUTES a mutation from free text. It
// answers grounded in a snapshot and may SUGGEST actions from a fixed,
// enumerated registry; the human clicks to run one. That keeps a
// misread "turn everything off" from ever firing on its own.

/** Every action the copilot is allowed to suggest — a closed set. Navigations
 *  route the owner somewhere; mutations flip an engine switch (always behind a
 *  human click, and the destructive-leaning ones ask to confirm). */
export type CopilotActionKind =
  | 'engine_on'
  | 'engine_off'
  | 'go_live'
  | 'go_dry_run'
  | 'hunter_on'
  | 'hunter_off'
  | 'open_call_list'
  | 'open_settings'
  | 'open_prospects'
  | 'open_briefing'

export interface CopilotActionDef {
  kind: CopilotActionKind
  /** Default button label (the AI may override with a context-fit label). */
  label: string
  /** true = flips engine state (needs a click; some also confirm). */
  mutation: boolean
  /** true = ask "are you sure?" before running (the higher-stakes flips). */
  confirm?: boolean
  /** Navigation target for non-mutation actions. */
  href?: string
  /** One-line hint the prompt shows the model so it suggests the right one. */
  when: string
}

export const COPILOT_ACTIONS: Record<CopilotActionKind, CopilotActionDef> = {
  engine_on: {
    kind: 'engine_on',
    label: 'Turn the engine on',
    mutation: true,
    when: 'the kill switch is on (engine off) and the owner wants to run it',
  },
  engine_off: {
    kind: 'engine_off',
    label: 'Turn the engine off',
    mutation: true,
    confirm: true,
    when: 'the owner wants to stop everything (kill switch)',
  },
  go_live: {
    kind: 'go_live',
    label: 'Switch to live sending',
    mutation: true,
    confirm: true,
    when: 'the engine is in dry-run and the owner wants real emails to send',
  },
  go_dry_run: {
    kind: 'go_dry_run',
    label: 'Switch to dry-run',
    mutation: true,
    when: 'the owner wants to pause real sending without stopping the engine',
  },
  hunter_on: {
    kind: 'hunter_on',
    label: 'Turn the hunter on',
    mutation: true,
    when: 'auto-enroll is off and the owner wants prospects enrolled automatically',
  },
  hunter_off: {
    kind: 'hunter_off',
    label: 'Turn the hunter off',
    mutation: true,
    when: 'auto-enroll is on and the owner wants to enroll manually again',
  },
  open_call_list: {
    kind: 'open_call_list',
    label: 'Open the call list',
    mutation: false,
    href: '/platform/prospecting/call-list',
    when: 'the owner should look at prospects to call',
  },
  open_settings: {
    kind: 'open_settings',
    label: 'Open prospecting settings',
    mutation: false,
    href: '/platform/prospecting/settings',
    when: 'the owner needs to change the brain, states, budgets, or safety rails',
  },
  open_prospects: {
    kind: 'open_prospects',
    label: 'Browse prospects',
    mutation: false,
    href: '/platform/prospecting',
    when: 'the owner wants to browse or filter the prospect list',
  },
  open_briefing: {
    kind: 'open_briefing',
    label: 'See the daily briefing',
    mutation: false,
    href: '/platform/prospecting',
    when: 'the owner wants the morning cockpit / next best action',
  },
}

export const COPILOT_ACTION_KINDS = Object.keys(COPILOT_ACTIONS) as CopilotActionKind[]

export interface CopilotSuggestedAction {
  kind: CopilotActionKind
  label: string
}

export interface CopilotResponse {
  /** The grounded answer, ready to render. */
  answer: string
  /** ≤3 suggested actions, all from the registry (unknown kinds dropped). */
  actions: CopilotSuggestedAction[]
}

/** The compact, grounded snapshot the copilot reasons over — assembled
 *  server-side and rendered into the prompt. All numbers are real reads. */
export interface CopilotSnapshot {
  engine: {
    killSwitch: boolean
    dryRun: boolean
    hunter: boolean
    watchdogTripped: boolean
    bookingEnabled: boolean
    enabledStates: string[]
  }
  wiring: { senderConfigured: boolean; gmailConfigured: boolean; placesConfigured: boolean }
  funnel: {
    discovered: number
    enriched: number
    contacted: number
    engaged: number
    callList: number
    converted: number
  }
  bands: { hot: number; warm: number; cool: number; low: number }
  last24h: {
    sent: number
    dryRun: number
    opens: number
    clicks: number
    replies: number
    newCallList: number
    autoEnrolled: number
  }
  nextAction: string
  callFirst: Array<{ name: string; state: string | null; summary: string | null; phone: string | null }>
  todaysDemos: Array<{ name: string; when: string }>
  brainCustomized: boolean
  battleCards: number
}

function yn(b: boolean): string {
  return b ? 'yes' : 'no'
}

/** Render the snapshot as a terse, model-legible fact block. */
export function renderCopilotSnapshot(s: CopilotSnapshot): string {
  const lines: string[] = []
  lines.push('ENGINE STATE:')
  lines.push(`- kill switch (everything off): ${yn(s.engine.killSwitch)}`)
  lines.push(
    `- sending mode: ${s.engine.dryRun ? 'DRY-RUN (personalizes + logs but sends nothing)' : 'LIVE (real emails go out)'}`,
  )
  lines.push(`- hunter (auto-enroll): ${s.engine.hunter ? 'ON' : 'off'}`)
  lines.push(`- deliverability watchdog tripped: ${yn(s.engine.watchdogTripped)}`)
  lines.push(`- self-booking demos: ${s.engine.bookingEnabled ? 'on' : 'off'}`)
  lines.push(`- states enabled for discovery: ${s.engine.enabledStates.join(', ') || 'NONE (discovery idle)'}`)
  lines.push('')
  lines.push('WIRING (from env secrets — the honest "why nothing sends" answer):')
  lines.push(`- outreach sender configured: ${yn(s.wiring.senderConfigured)}`)
  lines.push(`- outreach Gmail connected: ${yn(s.wiring.gmailConfigured)}`)
  lines.push(`- Google Places key set: ${yn(s.wiring.placesConfigured)}`)
  lines.push('')
  lines.push('FUNNEL (cumulative-forward totals):')
  lines.push(
    `- discovered ${s.funnel.discovered} · enriched ${s.funnel.enriched} · contacted ${s.funnel.contacted} · engaged ${s.funnel.engaged} · call list ${s.funnel.callList} · converted ${s.funnel.converted}`,
  )
  lines.push(
    `- live scored pool by band: hot ${s.bands.hot} · warm ${s.bands.warm} · cool ${s.bands.cool} · low ${s.bands.low}`,
  )
  lines.push('')
  lines.push('LAST 24 HOURS:')
  lines.push(
    `- sent ${s.last24h.sent} (dry-run logged ${s.last24h.dryRun}) · opens ${s.last24h.opens} · clicks ${s.last24h.clicks} · replies ${s.last24h.replies} · new call-list ${s.last24h.newCallList} · auto-enrolled ${s.last24h.autoEnrolled}`,
  )
  lines.push('')
  lines.push(`SUGGESTED NEXT ACTION (from the daily briefing): ${s.nextAction}`)
  if (s.todaysDemos.length) {
    lines.push('')
    lines.push("TODAY'S DEMOS:")
    for (const d of s.todaysDemos.slice(0, 5)) lines.push(`- ${d.name} at ${d.when}`)
  }
  if (s.callFirst.length) {
    lines.push('')
    lines.push('TOP OF THE CALL LIST:')
    for (const c of s.callFirst.slice(0, 5)) {
      const loc = c.state ? ` (${c.state})` : ''
      const phone = c.phone ? ` · ${c.phone}` : ''
      lines.push(`- ${c.name}${loc}${phone}${c.summary ? ` — ${c.summary}` : ''}`)
    }
  }
  lines.push('')
  lines.push(
    `BRAIN: ${s.brainCustomized ? 'owner-customized product knowledge' : 'using the built-in product knowledge'}; ${s.battleCards} competitor battle card(s).`,
  )
  return lines.join('\n')
}

/** Build the system + user prompt for the copilot. Pure + unit-testable. */
export function buildCopilotPrompt(
  snapshot: CopilotSnapshot,
  query: string,
): { system: string; user: string } {
  const actionMenu = COPILOT_ACTION_KINDS.map(
    (k) => `- ${k}: ${COPILOT_ACTIONS[k].label} — suggest when ${COPILOT_ACTIONS[k].when}`,
  ).join('\n')
  const system = [
    "You are the hunt copilot for Dream Create's dental-clinic prospecting engine (Dustin, the owner, is the only user). Answer his question or request using ONLY the snapshot below — it is the live state of his hunt. Never invent numbers, names, or state; if the snapshot doesn't contain the answer, say so plainly and point him where to look.",
    'Voice: warm, plain, direct, brief (2-4 sentences, no fluff, no exclamation marks). Talk like a sharp sales chief of staff, not a chatbot.',
    'You do NOT perform actions. When an engine change or a place to look would help, SUGGEST it via the actions list — Dustin clicks to run it. Only use kinds from this menu, and only when they genuinely fit the current state (e.g. never suggest engine_on when the engine is already on):',
    actionMenu,
    'Return at most 3 actions, most useful first, and none if none fit. Keep the answer itself self-contained — the buttons are a convenience, not the whole reply.',
    '',
    'SNAPSHOT:',
    renderCopilotSnapshot(snapshot),
  ].join('\n')
  return { system, user: query.slice(0, 2000) }
}

/** Tolerant parse of the model's tool output → a safe CopilotResponse.
 *  Drops unknown/duplicate action kinds, clamps to 3, never throws. */
export function parseCopilotResponse(raw: unknown): CopilotResponse | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const answer = typeof r.answer === 'string' ? r.answer.trim() : ''
  if (answer.length === 0) return null
  const seen = new Set<string>()
  const actions: CopilotSuggestedAction[] = []
  if (Array.isArray(r.actions)) {
    for (const a of r.actions) {
      if (!a || typeof a !== 'object') continue
      const kind = (a as Record<string, unknown>).kind
      if (typeof kind !== 'string' || !(kind in COPILOT_ACTIONS) || seen.has(kind)) continue
      seen.add(kind)
      const def = COPILOT_ACTIONS[kind as CopilotActionKind]
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

export const meta = {
  name: 'phase-audit',
  description: 'One round of the phase-gate audit (v2): 4 lens finders → single verify pass → main-loop confirmation',
  whenToUse:
    'After any transformation phase (or major feature slice). v2 gate: HARD CAP of 3 discovery rounds; done = a round with zero confirmed defects and zero in-phase depth gaps. If round 3 still finds significant items: fix them, write the root-cause retrospective, do the remaining discovery YOURSELF (sibling sweep + failure-mode matrix + crash-consistency), fix that, then confirm with ONE { verification: true } round. A phase closes CLEAN or it is not closed. Certificate goes in docs/AUDITS.md.',
  phases: [
    { title: 'Find', detail: '4 merged lens auditors', model: 'opus' },
    { title: 'Verify', detail: 'one defect skeptic + one depth judge', model: 'opus' },
  ],
}

/**
 * THE PHASE AUDIT v2 — the owner's standing quality gate, re-shaped for cost
 * (2026-07-27, after v1's Phase-1 run consumed ~75% of a monthly quota).
 *
 * WHAT CHANGED FROM v1 (and why):
 *  - MODELS: every subagent runs Opus 5 (`model:'opus'`) — near-flagship
 *    quality at a fraction of the cost. The MAIN LOOP (the session's own
 *    model) is the final arbiter: it re-verifies every survivor against the
 *    cited code before fixing anything. The Phase-1 round-5 close-out proved
 *    this works — main-loop verification of 11 candidates produced clean
 *    verdicts (10 confirm / 1 reject) at a tiny fraction of a skeptic
 *    chamber's cost.
 *  - LENSES: 9 → 4 (merged, below). v1's lenses overlapped heavily; the
 *    merged prompts keep every checklist item.
 *  - VERIFY: 3 skeptics + 3 judges → ONE skeptic + ONE judge, because the
 *    main loop now provides the second, decisive opinion.
 *  - ROUNDS: HARD CAP 3 discovery rounds (enforced in this script — round
 *    > 3 refuses to run unless { verification: true }). Done = a clean
 *    round (zero confirmed defects + zero in-phase gaps). v1's "two
 *    consecutive clean rounds" is retired: with a healthy phase, round 1
 *    finds the real items, round 2 verifies the fixes and comes back clean
 *    or near-clean, round 3 is the safety margin. If round 3 STILL
 *    surfaces significant items, more DISCOVERY-BY-AUDIT is the wrong tool
 *    — but the phase still has to reach a clean state (the owner's
 *    2026-07-28 clarification: the retrospective is not the finish line).
 *    The orchestrator fixes what round 3 found, writes the retrospective,
 *    runs the retrospective's lessons as a direct main-loop SELF-SWEEP
 *    (sibling-sweep every fix from all rounds, walk the component ×
 *    failure-mode matrix, check crash-consistency of every claim-then-act),
 *    fixes what that finds, then confirms with ONE { verification: true }
 *    round — which doesn't count against the cap. A failed verification
 *    means the sweep was insufficient: extend the sweep to the missed
 *    class, fix, verify once more. A phase closes CLEAN or it is not
 *    closed.
 *
 * Two chambers, unchanged in spirit ("perfection plus depth"):
 *   PERFECTION — findings are DEFECTS; the skeptic tries to refute each;
 *     skeptic-confirmed survivors go to the main loop for final
 *     confirmation, then must be fixed.
 *   DEPTH — "would it make sense to add more?" Findings are PROPOSALS the
 *     judge triages: in_phase (blocks done) | backlog (owner's menu) |
 *     reject.
 *
 * FALLBACK: if the Workflow runtime is broken (the 2026-07-27 permission-
 * handler fault stripped tool params from workflow subagents), run the same
 * shape via direct Agent-tool fan-out with `model: 'opus'` — the prompts
 * below are self-contained on purpose.
 *
 * args: {
 *   phase: string          — e.g. "Phase 2 — the voice"
 *   range: string          — git commit range, e.g. "090747b..abc1234"
 *   claims: string[]       — what the phase says it delivered
 *   round: number          — 1-based; values > 3 are REFUSED
 *   priorFindings?: string — summary of previously fixed findings, so
 *                            round N doesn't re-report what round N-1 fixed
 *   extraDocs?: string[]   — additional governing docs beyond the defaults
 * }
 */

// Args may arrive as a parsed object or a JSON string depending on the
// invoking surface — accept both, and default every field defensively.
const A = typeof args === 'string' ? JSON.parse(args) : (args ?? {})
const {
  phase: phaseName = 'unnamed phase',
  range = 'HEAD~1..HEAD',
  claims = [],
  round = 1,
  priorFindings = '',
  extraDocs = [],
} = A

// ── THE ROUND CAP (the owner's mandate, 2026-07-27; semantics clarified
//    2026-07-28) ─────────────────────────────────────────────────────────────
// Three DISCOVERY rounds, ever. The cap does NOT mean "file a retrospective
// and move on" — the phase still has to reach a clean state; the cap means
// the AUDIT is the wrong tool for finding what's left. When round 3 is not
// clean: (1) fix everything confirmed, (2) write the root-cause
// retrospective, (3) the MAIN LOOP does the remaining discovery itself — a
// direct systematic sweep applying the retrospective's lessons (sibling
// sweep of every fix, the full component × failure-mode matrix,
// crash-consistency of every claim-then-act) — and fixes what it finds,
// then (4) ONE verification round (`verification: true`) confirms clean.
// Verification rounds don't count against the cap; they are allowed only
// AFTER a documented self-sweep, and only one per sweep — if verification
// is not clean, the sweep was insufficient: fix, sweep deeper, verify again.
const MAX_ROUNDS = 3
const isVerification = A.verification === true
if (round > MAX_ROUNDS && !isVerification) {
  return {
    round,
    range,
    clean: false,
    invalid: true,
    escalate: true,
    defects: [],
    inPhaseGaps: [],
    backlog: [],
    rejected: [],
    note: `REFUSED — round ${round} exceeds the hard cap of ${MAX_ROUNDS} discovery rounds. The audit is the wrong tool now, but the JOB remains: fix what round 3 found, write the owner a root-cause retrospective, do the remaining discovery YOURSELF (sibling sweep of every fix, the component × failure-mode matrix, crash-consistency of every claim-then-act), fix what that finds, then run ONE confirmation pass with { verification: true }.`,
  }
}

const GOVERNING_DOCS = [
  'DESIGN.md (the section "The North Star" is LAW and outranks everything)',
  'CLAUDE.md (the Conventions section — every convention is binding)',
  ...extraDocs,
]

const MANIFEST = `
== THE AUDIT MANIFEST =================================================
Product: DreamCRM — a patient-relationship platform for dental clinics.
The customers are kind, overworked, non-technical dental staff; the
owner's standard is THE PINNACLE: "perfection plus depth."

Phase under audit: ${phaseName}   (audit round ${round} of max ${MAX_ROUNDS})
Git range: ${range}

The phase CLAIMS it delivered:
${claims.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}
${priorFindings ? `\nAlready found and FIXED in earlier rounds (do NOT re-report these):\n${priorFindings}\n` : ''}
Governing documents you MUST read first:
${GOVERNING_DOCS.map((d) => `  - ${d}`).join('\n')}

How to work:
- You are in the repo. Start with \`git log --oneline ${range}\` and
  \`git show <sha> --stat\`, then read the changed files IN FULL, then read
  whatever surrounding code you need to judge them in context.
- You may run targeted probes: \`pnpm vitest run <testfile>\` and
  \`pnpm typecheck\`. Do NOT modify any file. Do NOT run the full suite.
- Evidence over vibes: every finding must cite file:line (or a concrete
  absence: "X is registered in <file> but no code does Y").
- Report ONLY genuine findings. An empty findings list is a fully valid,
  respected answer — padding the report with trivia dilutes the audit.
- Severity for defects: critical (wrong data/behavior reaches a clinic) |
  major (wrong under realistic conditions) | minor (real but low-impact).
=======================================================================
`

const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'title', 'file', 'evidence', 'why'],
        properties: {
          kind: { type: 'string', enum: ['defect', 'depth'] },
          title: { type: 'string', maxLength: 120 },
          file: { type: 'string', description: 'repo-relative path (primary location)' },
          evidence: {
            type: 'string',
            description: 'file:line cites + the concrete facts; for depth: what is missing and where it would live',
          },
          why: {
            type: 'string',
            description: 'defect: the failure scenario. depth: the value to the clinic + why THIS phase is not honestly done without it (or say it may be future scope)',
          },
          severity: { type: 'string', enum: ['critical', 'major', 'minor'] },
        },
      },
    },
  },
}

const VOTES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['votes'],
  properties: {
    votes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'verdict', 'reason'],
        properties: {
          id: { type: 'integer' },
          verdict: { type: 'string', enum: ['confirm', 'reject', 'in_phase', 'backlog'] },
          reason: { type: 'string', maxLength: 400 },
        },
      },
    },
  },
}

// ── The lenses: v1's nine, merged into four. Each finder is independent and
//    never sees another finder's output or the author's reasoning. ──────────
const LENSES = [
  {
    key: 'claims',
    prompt: `You are the CLAIMS auditor: does the code DO what the phase claims, ALL of
what it claims, and NOTHING it doesn't own up to? Three hunts in one pass:
(1) SEMANTICS — meaning drift: names, doc comments, UI copy, and metric names
that promise one thing while the code does another. Read every SQL predicate
and boundary condition in the changed files and ask "which real-world
person/state does this misclassify?" (a status the query forgot, a state
between states, an edge the enum hides).
(2) COMPLETENESS — build the full inventory (registries, enums, capability
lists, config keys, exported functions, the manifest's claims), then verify
each item has its counterpart (writer, reader, handler, test, doc). N-of-M
gaps ("7 registered, 3 wired") are your specialty; also dead exports nothing
consumes.
(3) UNCLAIMED CHANGES — anything in the git range no claim covers is
unaudited change: name it, and check docs that now lie because of it.
kind='defect' for every finding.`,
  },
  {
    key: 'law',
    prompt: `You are the LAW auditor: the codebase's conventions and the product's
doctrine are both binding. Verify the changed files against ALL of them:
CLAUDE.md conventions — (1) clinic-timezone law: any server-side date/time
render or day-window must use the clinic-tz helpers; (2) tenant scoping:
every read filters organizationId, every insert sets it; (3) no-fake-content:
every UI-visible value reads a real column and the demo seeder covers every
state a surface can show; (4) single-home assets; (5) services are
'import server-only'; (6) best-effort reads on hub surfaces; (7) anti-shame
voice in reader-facing strings.
DESIGN.md "The North Star" — (a) the design test: does anything here ask the
clinic to OPERATE something where the employee should do the job and report?
(b) narrator voice: machine-written summaries genuinely plain-English,
name-carrying, anti-shame; (c) the autonomy law: nothing grants itself
autonomy, defaults encode today's behavior; (d) derived-not-stamped: no
journey state hand-written where it should be derived; (e) "new patients
means seated" honored by every metric the phase touched.
kind='defect' for every finding.`,
  },
  {
    key: 'resilience',
    prompt: `You are the RESILIENCE auditor: what breaks under realistic stress, and
would the tests catch it? Two hunts in one pass:
(1) FAILURE MODES — error paths (what happens when each await rejects — does
the primary action survive its bookkeeping?); idempotency + races (crons
overlapping, double-fires, unique-violation handling); migration safety on a
LIVE database (order, defaults, nullability, index cost); performance of
org-wide queries at a real clinic's scale (thousands of patients, tens of
thousands of appointments); PMS-sync + bulk-import interactions with every
new metric; null/legacy data (columns added mid-history).
(2) TEST ADEQUACY — for each changed behavior ask: "what code change would
break production but still pass these tests?" Every concrete answer is a
finding. Look for tests that assert source strings where behavior is
testable, mocked seams so wide the test can't fail, missing edge cases the
code explicitly handles, and SQL-predicate layers with zero executed
coverage.
kind='defect' for every finding (severity = what the gap could let through).`,
  },
  {
    key: 'depth',
    prompt: `You are the DEPTH auditor — the owner's question is yours: "WOULD IT MAKE
SENSE TO ADD MORE?" The standard is the pinnacle: the best imaginable version
of THIS PHASE'S mission (not the whole roadmap). Two viewpoints in one pass:
(1) THE PINNACLE — study what shipped, then name what the pinnacle version
would additionally contain: missing states, missing writers/readers, missing
symmetry (X exists for A but not B), tooling the next phase will obviously
need that this phase should have laid, hooks that cost 10x more to add later.
(2) THE HUMANS — walk a kind non-technical office manager AND the platform
owner (reading next week's standup built from this phase's data) through what
shipped. Where does it under-serve them? Missing narrator warmth (names,
stories, outcomes)? Data recorded but useless for the story it must someday
tell? States a real clinic hits that produce nothing?
For each: kind='depth', and in 'why' say plainly whether this phase is
honestly incomplete without it, or whether it is genuinely future scope. Do
not propose things the doctrine assigns to later phases unless deferring
them creates rework.`,
  },
]

// ── Stage 1: the finder fan-out (Opus) ──────────────────────────────────────
phase('Find')
log(`Round ${round}/${MAX_ROUNDS}: ${LENSES.length} merged lens auditors on ${range}`)

const finderResults = await parallel(
  LENSES.map((l) => () =>
    agent(`${l.prompt}\n${MANIFEST}`, {
      label: `find:${l.key}`,
      phase: 'Find',
      schema: FINDINGS_SCHEMA,
      model: 'opus',
      effort: 'high',
    }).then((r) => ({ lens: l.key, findings: r?.findings ?? [] })),
  ),
)

// INTEGRITY LAW: a finder that DIED is not a finder that found nothing.
// parallel() resolves a failed agent to null — if any lens never reported
// (tool faults, retry-cap, kill), the round is INVALID and must be re-run.
// (Observed 2026-07-27: a harness tool fault killed every finder and the
// round self-declared clean.)
const deadLenses = LENSES.filter((_, i) => !finderResults[i]).map((l) => l.key)
if (deadLenses.length > 0) {
  return {
    round,
    range,
    clean: false,
    invalid: true,
    deadLenses,
    defects: [],
    inPhaseGaps: [],
    backlog: [],
    rejected: [],
    note: `ROUND INVALID — ${deadLenses.length}/${LENSES.length} lens auditor(s) never reported (${deadLenses.join(', ')}). A dead auditor is not a clean auditor; re-run the round (an invalid round does NOT consume one of the ${MAX_ROUNDS}).`,
  }
}

const all = []
for (const fr of finderResults.filter(Boolean)) {
  for (const f of fr.findings) all.push({ ...f, lens: fr.lens })
}

// Dedupe near-identical findings (same file + similar title) in code.
const seen = new Map()
for (const f of all) {
  const key = `${f.kind}|${f.file}|${f.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60)}`
  if (!seen.has(key)) seen.set(key, f)
  else seen.get(key).lens += `+${f.lens}`
}
const candidates = Array.from(seen.values()).map((f, i) => ({ ...f, id: i }))
const defectCandidates = candidates.filter((f) => f.kind === 'defect')
const depthCandidates = candidates.filter((f) => f.kind === 'depth')
log(
  `Found ${defectCandidates.length} defect candidate(s), ${depthCandidates.length} depth candidate(s) (from ${all.length} raw)`,
)

if (candidates.length === 0) {
  return {
    round,
    range,
    clean: true,
    defects: [],
    inPhaseGaps: [],
    backlog: [],
    rejected: [],
    note: 'CLEAN ROUND — no candidates from any lens. The gate is satisfied: write the certificate in docs/AUDITS.md.',
  }
}

const listFor = (items) =>
  items
    .map(
      (f) =>
        `[#${f.id}] (${f.severity ?? 'n/a'}, lens ${f.lens}) ${f.title}\n  file: ${f.file}\n  evidence: ${f.evidence}\n  why: ${f.why}`,
    )
    .join('\n\n')

// ── Stage 2: ONE skeptic (defects) + ONE judge (depth), both Opus. The main
//    loop is the second, decisive vote — see the note in the return payload. ─
phase('Verify')

const skepticPrompt = `You are the adversarial SKEPTIC on the phase audit for "${phaseName}"
(git range ${range}). Below are defect claims from independent auditors. Your
job is to REFUTE each one — read the actual code and try to prove the claim
wrong, exaggerated, or already handled; also check the failure scenario
actually occurs with real data/flows and that the severity is honest. Vote
per id: 'confirm' ONLY when you tried to kill it and could not; otherwise
'reject' with the disproof. When uncertain after real investigation, reject —
a false defect wastes a fix cycle. Do not modify files. You may run
typecheck/targeted tests.

THE CLAIMS:
${listFor(defectCandidates)}`

const judgePrompt = `You are the DEPTH JUDGE on the phase audit for "${phaseName}" (git range
${range}). Judge from three standpoints at once: the dental clinic's front
desk (does this serve them?), the platform owner (pinnacle standard, but
phases must end), and the next phase's builder (what gets 10x costlier if
deferred?). The owner's standard: "perfection plus depth — would it make
sense to add more?" Below are depth proposals. Verify each against the
actual code (is it truly missing?), then vote per id:
- 'in_phase'  — the phase is not honestly complete without it; deferring it
                would betray the phase's own mission or create rework;
- 'backlog'   — real value, but honestly future scope (a later phase or its
                own feature);
- 'reject'    — not actually missing, or would not serve dental clinics.
Scope discipline matters: 'in_phase' is a strong claim — the build stops
until it ships. Do not modify files.

THE PROPOSALS:
${listFor(depthCandidates)}`

const [skepticVotes, judgeVotes] = await parallel([
  () =>
    defectCandidates.length === 0
      ? Promise.resolve({ votes: [] })
      : agent(skepticPrompt, {
          label: 'skeptic',
          phase: 'Verify',
          schema: VOTES_SCHEMA,
          model: 'opus',
          effort: 'high',
        }),
  () =>
    depthCandidates.length === 0
      ? Promise.resolve({ votes: [] })
      : agent(judgePrompt, {
          label: 'judge',
          phase: 'Verify',
          schema: VOTES_SCHEMA,
          model: 'opus',
          effort: 'high',
        }),
])

// Same integrity law for the verify chamber: a dead skeptic can never
// confirm (defects silently die) and a dead judge can never vote in_phase
// (gaps silently demote). A dead voter invalidates the round.
const skepticDead = defectCandidates.length > 0 && !skepticVotes
const judgeDead = depthCandidates.length > 0 && !judgeVotes
if (skepticDead || judgeDead) {
  return {
    round,
    range,
    clean: false,
    invalid: true,
    note: `ROUND INVALID — the ${[skepticDead && 'skeptic', judgeDead && 'judge'].filter(Boolean).join(' and ')} never reported; the tally would be biased. Re-run the round (an invalid round does NOT consume one of the ${MAX_ROUNDS}).`,
    defects: [],
    inPhaseGaps: [],
    backlog: [],
    rejected: [],
    unverifiedCandidates: candidates,
  }
}

const voteFor = (panel, id) => (panel?.votes ?? []).find((v) => v.id === id) ?? null

const defects = []
const rejected = []
for (const f of defectCandidates) {
  const vote = voteFor(skepticVotes, f.id)
  const entry = { ...f, vote }
  // No vote for an id = the skeptic dropped it; treat as unconfirmed but
  // surface it in `rejected` so the main loop can see (and overrule) it.
  if (vote?.verdict === 'confirm') defects.push(entry)
  else rejected.push(entry)
}

const inPhaseGaps = []
const backlog = []
for (const f of depthCandidates) {
  const vote = voteFor(judgeVotes, f.id)
  const entry = { ...f, vote }
  if (vote?.verdict === 'in_phase') inPhaseGaps.push(entry)
  else if (vote?.verdict === 'reject') rejected.push(entry)
  else backlog.push(entry) // backlog vote or dropped id → the owner's menu
}

log(
  `Verified: ${defects.length} defect(s) confirmed, ${inPhaseGaps.length} in-phase gap(s), ${backlog.length} for the backlog, ${rejected.length} rejected`,
)

// ── The verdicts + the round-3 escalation rule ──────────────────────────────
const clean = defects.length === 0 && inPhaseGaps.length === 0
const significant =
  inPhaseGaps.length > 0 ||
  defects.some((d) => d.severity === 'critical' || d.severity === 'major')
const escalate = !isVerification && round >= MAX_ROUNDS && significant

let note
if (clean) {
  note = isVerification
    ? 'VERIFICATION ROUND CLEAN — the self-sweep held. The gate is satisfied; write the certificate (noting it closed via self-sweep + verification) in docs/AUDITS.md.'
    : 'CLEAN ROUND — the gate is satisfied. Write the certificate in docs/AUDITS.md.'
} else if (isVerification) {
  note = `VERIFICATION ROUND NOT CLEAN — the self-sweep missed the items below. This is on the sweep, not the auditors: fix these, ask what CLASS each one belongs to that the sweep's checklists didn't cover, extend the sweep to that class across the whole phase, then run ONE more verification round. Do not fall back to discovery rounds.`
} else if (escalate) {
  note = `ROUND ${MAX_ROUNDS} IS STILL FINDING SIGNIFICANT ITEMS — discovery-by-audit is over, but the JOB is not: the phase still has to reach a clean state, and the remaining discovery is YOURS now (2026-07-28 owner clarification). Do, in order: (1) fix everything listed below; (2) write the owner a ROOT-CAUSE RETROSPECTIVE in docs/AUDITS.md ("why did this phase ship with this many gaps?") covering which lens kept finding items, whether the phase's claims matched what was attempted, and what convention would have prevented each recurring class; (3) run those lessons as a DIRECT SELF-SWEEP in the main loop — sibling-sweep every fix from all rounds, walk the full component × failure-mode matrix, check crash-consistency of every claim-then-act — and fix what it finds; (4) confirm with ONE { verification: true } round. A phase closes CLEAN or it is not closed.`
} else {
  note = `MAIN-LOOP CONFIRMATION REQUIRED before fixing: the survivors below carry ONE Opus skeptic/judge vote, not v1's three. You (the main loop, on the session's stronger model) are the second, decisive vote — re-verify each confirmed defect and in-phase gap against the cited code (read the files yourself; the Phase-1 round-5 close-out is the pattern), overturn anything that does not hold, then fix the true survivors and run the next round (${round + 1} of ${MAX_ROUNDS}) over the fix range. Also skim \`rejected\` — a skeptic 'reject' you disagree with may be overruled with cited evidence.`
}

return {
  round,
  range,
  clean,
  escalate,
  defects,
  inPhaseGaps,
  backlog,
  rejected,
  note,
}

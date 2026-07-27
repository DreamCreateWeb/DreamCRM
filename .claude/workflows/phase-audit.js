export const meta = {
  name: 'phase-audit',
  description: 'One round of the phase-gate audit: lens finders → adversarial verify → triage',
  whenToUse:
    'After any transformation phase (or major feature slice): run rounds until TWO consecutive rounds return zero confirmed defects AND zero in-phase depth gaps. Certificate goes in docs/AUDITS.md.',
  phases: [
    { title: 'Find', detail: '8 independent lens auditors + 1 audit-the-audit critic' },
    { title: 'Verify', detail: 'defect skeptics (refute) + depth judges (value/scope)' },
  ],
}

/**
 * THE PHASE AUDIT — the owner's standing quality gate (2026-07-27).
 *
 * Two chambers, per the owner's standard ("perfection plus depth"):
 *   PERFECTION — is what was built correct, complete, and law-abiding?
 *     Findings are DEFECTS; they face 3 adversarial skeptics; majority
 *     confirm → must be fixed before the phase can run dry.
 *   DEPTH — "would it make sense to add more?" Findings are PROPOSALS;
 *     they face 3 value judges who triage: in_phase (this phase is not
 *     honestly done without it) | backlog (real value, future scope) |
 *     reject. In-phase gaps block dry; backlog goes to the owner's menu.
 *
 * DRY = two consecutive rounds with zero confirmed defects and zero
 * in-phase gaps. The main loop orchestrates rounds (fixing between them);
 * this workflow is ONE round.
 *
 * args: {
 *   phase: string          — e.g. "Phase 1 — the spine"
 *   range: string          — git commit range, e.g. "1e8de2c..181be84"
 *   claims: string[]       — what the phase says it delivered
 *   round: number          — 1-based round counter (for labels/report)
 *   priorFindings?: string — summary of previously fixed findings, so
 *                            round N doesn't re-report what round N-1 fixed
 *   extraDocs?: string[]   — additional governing docs beyond the defaults
 * }
 */

const { phase, range, claims, round = 1, priorFindings = '', extraDocs = [] } = args

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

Phase under audit: ${phase}   (audit round ${round})
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

// ── The lenses. Six perfection, two depth. Each finder is independent and
//    never sees another finder's output or the author's reasoning. ──────────
const LENSES = [
  {
    key: 'semantics',
    prompt: `You are the SEMANTICS auditor: does the code MEAN what its words claim?
Hunt meaning drift: names, doc comments, and UI copy that promise one thing
while the code does another. Read every SQL predicate and boundary condition
in the changed files and ask "which real-world person/state does this
misclassify?" (e.g. a status the query forgot, a state between states, an
edge the enum hides). Check that every metric's NAME matches its actual
measurement window/filter. kind='defect' for every finding.`,
  },
  {
    key: 'completeness',
    prompt: `You are the COMPLETENESS auditor: is everything that was REGISTERED,
DECLARED, or PROMISED actually wired end-to-end? Build the full inventory
first (registries, enums, capability lists, config keys, exported functions,
claims in the manifest), then verify each item has its counterpart (writer,
reader, handler, test, doc). N-of-M gaps are your specialty — "7 registered,
3 wired" class failures. Also the inverse: dead exports nothing consumes.
kind='defect' for every finding.`,
  },
  {
    key: 'codebase-law',
    prompt: `You are the CODEBASE-LAW auditor. CLAUDE.md's conventions are binding law;
verify the changed files against ALL of them, especially: (1) clinic-timezone
law — any server-side date/time render or day-window must use the clinic-tz
helpers; (2) tenant scoping — every read filters organizationId, every insert
sets it; (3) no-fake-content — every UI-visible value reads a real column,
and the demo seeder covers every state a surface can show; (4) single-home
assets; (5) services are 'import server-only'; (6) best-effort reads on hub
surfaces; (7) anti-shame voice in reader-facing strings. kind='defect'.`,
  },
  {
    key: 'doctrine',
    prompt: `You are the DOCTRINE auditor. Read DESIGN.md "The North Star" first — it is
law. Verify the phase against it: (1) the design test — does anything here
ask the clinic to OPERATE something where the employee should do the job and
report? (2) narrator voice — are machine-written summaries (ledger entries
etc.) genuinely plain-English, name-carrying, anti-shame — would a front desk
smile reading them? (3) the autonomy law — nothing grants itself autonomy,
defaults encode today's behavior; (4) derived-not-stamped — no journey state
is hand-written where it should be derived; (5) "new patients means seated"
is honored by every metric the phase touched. kind='defect'.`,
  },
  {
    key: 'failure-modes',
    prompt: `You are the FAILURE-MODES auditor: what breaks under realistic stress?
Check: error paths (what happens when each await rejects — does the primary
action survive its bookkeeping?); idempotency + races (crons overlapping,
double-fires, unique-violation handling); migration safety on a LIVE database
(order, defaults, nullability, index cost); performance of org-wide queries
at a real clinic's scale (thousands of patients, tens of thousands of
appointments); PMS-sync + bulk-import interactions with every new metric;
null/legacy data (columns added mid-history). kind='defect'.`,
  },
  {
    key: 'test-adequacy',
    prompt: `You are the TEST-ADEQUACY auditor: do the phase's tests pin BEHAVIOR, or do
they merely mirror the implementation? For each changed behavior, ask: "what
code change would break production but still pass these tests?" — every
concrete answer is a finding. Look for: tests that assert source-code strings
instead of behavior where behavior is testable; mocked seams so wide the test
can't fail; missing edge cases the code explicitly handles; the service layer
(SQL predicates) having ZERO executed coverage while only the pure layer is
tested. kind='defect' (severity = what the gap could let through).`,
  },
  {
    key: 'depth-pinnacle',
    prompt: `You are the DEPTH auditor — the owner's question is yours: "WOULD IT MAKE
SENSE TO ADD MORE?" The standard is the pinnacle: the best imaginable version
of THIS PHASE'S mission (not the whole roadmap). Study what shipped, then
name what the pinnacle version would additionally contain: missing states,
missing writers/readers, missing symmetry (X exists for A but not B), tooling
the next phase will obviously need that this phase should have laid, hooks
that cost 10x more to add later. For each: kind='depth', and in 'why' say
plainly whether this phase is honestly incomplete without it, or whether it
is genuinely future scope. Do not propose things the doctrine assigns to
later phases unless deferring them creates rework.`,
  },
  {
    key: 'depth-frontdesk',
    prompt: `You are the FRONT-DESK depth auditor. Walk two humans through what this
phase built: (1) a kind, non-technical office manager at a small dental
clinic; (2) the platform owner reading next week's standup built from this
phase's data. Where does the phase under-serve them? Missing narrator warmth
(names, stories, outcomes)? Data recorded but useless for the story it must
someday tell? States a real clinic hits that produce nothing? Every gap:
kind='depth', with 'why' explaining the human moment it fails. Same in-phase
vs future-scope honesty as the manifest demands.`,
  },
  {
    key: 'audit-the-audit',
    prompt: `You are the COMPLETENESS CRITIC — you audit what eight other auditors (whose
reports you cannot see) probably all skipped. Assume they covered: named
semantics, registry completeness, codebase conventions, doctrine conformance,
failure modes, test adequacy, and depth. Now hunt the unexamined: files the
phase SHOULD have touched but didn't; interactions with subsystems nobody
associates with this phase; the second-order effects of renames/moves; docs
that now lie; anything in the git range that no claim covers (unclaimed
changes are unaudited changes). Report what you actually verify, either
kind.`,
  },
]

// ── Stage 1: the finder fan-out ─────────────────────────────────────────────
phase('Find')
log(`Round ${round}: ${LENSES.length} independent auditors on ${range}`)

const finderResults = await parallel(
  LENSES.map((l) => () =>
    agent(`${l.prompt}\n${MANIFEST}`, {
      label: `find:${l.key}`,
      phase: 'Find',
      schema: FINDINGS_SCHEMA,
      effort: 'high',
    }).then((r) => ({ lens: l.key, findings: r?.findings ?? [] })),
  ),
)

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
    note: 'CLEAN ROUND — no candidates from any lens.',
  }
}

const listFor = (items) =>
  items
    .map(
      (f) =>
        `[#${f.id}] (${f.severity ?? 'n/a'}, lens ${f.lens}) ${f.title}\n  file: ${f.file}\n  evidence: ${f.evidence}\n  why: ${f.why}`,
    )
    .join('\n\n')

// ── Stage 2: adversarial verification (defects) + value judging (depth) ────
phase('Verify')

const skepticPrompt = (angle) => `You are an adversarial SKEPTIC on the phase audit for "${phase}"
(git range ${range}). Below are defect claims from independent auditors. Your
job is to REFUTE each one from the ${angle} angle — read the actual code and
try to prove the claim wrong, exaggerated, or already handled. Vote per id:
'confirm' ONLY when you tried to kill it and could not (and the severity is
honest); otherwise 'reject' with the disproof. When uncertain after real
investigation, reject — a false defect wastes a fix cycle. Do not modify
files. You may run typecheck/targeted tests.

THE CLAIMS:
${listFor(defectCandidates)}`

const judgePrompt = (persona) => `You are a DEPTH JUDGE on the phase audit for "${phase}" (git range
${range}), judging from the standpoint of ${persona}. The owner's standard:
"perfection plus depth — would it make sense to add more?" Below are depth
proposals. Verify each against the actual code (is it truly missing?), then
vote per id:
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
      ? Promise.resolve([])
      : parallel(
          ['correctness (is the claimed behavior actually wrong?)', 'reproduction (does the failure scenario actually occur with real data/flows?)', 'severity (is the impact honestly rated, or inflated trivia?)'].map(
            (angle, i) => () =>
              agent(skepticPrompt(angle), {
                label: `skeptic:${i + 1}`,
                phase: 'Verify',
                schema: VOTES_SCHEMA,
                effort: 'high',
              }),
          ),
        ),
  () =>
    depthCandidates.length === 0
      ? Promise.resolve([])
      : parallel(
          ["the dental clinic's front desk (does this serve them?)", 'the platform owner (pinnacle standard, but phases must end)', "the next phase's builder (what gets 10x costlier if deferred?)"].map(
            (persona, i) => () =>
              agent(judgePrompt(persona), {
                label: `judge:${i + 1}`,
                phase: 'Verify',
                schema: VOTES_SCHEMA,
                effort: 'high',
              }),
          ),
        ),
])

function tally(votesByAgent, id) {
  const out = []
  for (const va of (votesByAgent ?? []).filter(Boolean)) {
    const v = (va.votes ?? []).find((x) => x.id === id)
    if (v) out.push(v)
  }
  return out
}

const defects = []
const rejected = []
for (const f of defectCandidates) {
  const votes = tally(skepticVotes, f.id)
  const confirms = votes.filter((v) => v.verdict === 'confirm').length
  const entry = { ...f, votes }
  if (confirms >= 2) defects.push(entry)
  else rejected.push(entry)
}

const inPhaseGaps = []
const backlog = []
for (const f of depthCandidates) {
  const votes = tally(judgeVotes, f.id)
  const inPhase = votes.filter((v) => v.verdict === 'in_phase').length
  const rejects = votes.filter((v) => v.verdict === 'reject').length
  const entry = { ...f, votes }
  if (inPhase >= 2) inPhaseGaps.push(entry)
  else if (rejects >= 2) rejected.push(entry)
  else backlog.push(entry) // mixed/backlog-majority → the owner's menu
}

log(
  `Verified: ${defects.length} defect(s) confirmed, ${inPhaseGaps.length} in-phase gap(s), ${backlog.length} for the backlog, ${rejected.length} rejected`,
)

return {
  round,
  range,
  clean: defects.length === 0 && inPhaseGaps.length === 0,
  defects,
  inPhaseGaps,
  backlog,
  rejected,
}

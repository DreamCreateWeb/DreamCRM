// Client-safe CallScript type + junk-tolerant reader — the AI-generated
// cold-call script cached on prospect.call_script (jsonb, migration 0125).
// Where the demo brief (demo-brief.ts) scripts the DEMO, this scripts the
// DIAL: what to say in the first ten seconds of a cold call, why THIS
// practice should care, the likely brush-offs with one-breath answers, the
// demo ask, and a 20-second voicemail for the half of calls nobody answers.
// Generated with haiku on first view in Call Mode; regenerate overwrites
// wholesale. The service validates with zod at generation time; this parser
// guards reads of stored blobs.

export interface CallScript {
  version: 1
  generatedAt: string // ISO
  /** The first ten seconds — name-checks the practice, one real observation. */
  opener: string
  /** Why THEM: their specific situation in one or two sentences. */
  whyThem: string
  /** ≤3 value points mapped to their verified gaps. */
  valuePoints: string[]
  /** Likely brush-offs + one-breath responses. */
  objections: Array<{ objection: string; response: string }>
  /** The one clear ask — a 20-minute demo. */
  ask: string
  /** A ~20-second voicemail for when nobody answers. */
  voicemail: string
}

function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
}

/** Junk-tolerant reader for the stored jsonb — null on anything unusable. */
export function parseCallScript(raw: unknown): CallScript | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const opener = str(r.opener, 400)
  const whyThem = str(r.whyThem, 500)
  const ask = str(r.ask, 300)
  const voicemail = str(r.voicemail, 600)
  if (!opener || !whyThem || !ask || !voicemail) return null

  const valuePoints = (Array.isArray(r.valuePoints) ? r.valuePoints : [])
    .map((p) => str(p, 200))
    .filter((p): p is string => p !== null)
    .slice(0, 3)

  const objections = (Array.isArray(r.objections) ? r.objections : [])
    .map((o) => {
      const row = o as Record<string, unknown>
      const objection = str(row.objection, 200)
      const response = str(row.response, 400)
      return objection && response ? { objection, response } : null
    })
    .filter((o): o is NonNullable<typeof o> => o !== null)
    .slice(0, 4)

  return {
    version: 1,
    generatedAt: str(r.generatedAt, 40) ?? new Date(0).toISOString(),
    opener,
    whyThem,
    valuePoints,
    objections,
    ask,
    voicemail,
  }
}

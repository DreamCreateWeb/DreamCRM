// Client-safe DemoBrief type + resolve-tolerant reader — the AI-generated
// pre-demo one-pager cached on prospect.demo_brief (jsonb, migration 0117).
// Owner-initiated (sonnet), regenerated wholesale; the service validates
// with zod at generation time, this parser guards reads of stored blobs.

export type BeatWeight = 'lead' | 'standard' | 'skim'

export interface DemoBrief {
  version: 1
  generatedAt: string // ISO
  model: 'sonnet'
  /** Quotable first sentence for the call/screen-share open. */
  openingLine: string
  /** The story of their current online presence, from verified signals. */
  walkUpStory: string
  /** Which beats to lead with / skim for THIS practice. */
  beatEmphasis: Array<{ beatId: string; weight: BeatWeight; why: string }>
  /** Most likely objections + one-breath responses. */
  objections: Array<{ objection: string; response: string }>
  /** Verified gaps mapped to the beat where the owner should land them. */
  ammunition: Array<{ beatId: string; point: string }>
  closingAsk: string
}

const WEIGHTS = new Set<BeatWeight>(['lead', 'standard', 'skim'])

function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
}

/** Junk-tolerant reader for the stored jsonb — null on anything unusable. */
export function parseDemoBrief(raw: unknown): DemoBrief | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const openingLine = str(r.openingLine, 300)
  const walkUpStory = str(r.walkUpStory, 800)
  const closingAsk = str(r.closingAsk, 300)
  if (!openingLine || !walkUpStory || !closingAsk) return null

  const beatEmphasis = (Array.isArray(r.beatEmphasis) ? r.beatEmphasis : [])
    .map((e) => {
      const row = e as Record<string, unknown>
      const beatId = str(row.beatId, 40)
      const why = str(row.why, 200)
      const weight = WEIGHTS.has(row.weight as BeatWeight) ? (row.weight as BeatWeight) : null
      return beatId && why && weight ? { beatId, weight, why } : null
    })
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .slice(0, 10)

  const objections = (Array.isArray(r.objections) ? r.objections : [])
    .map((o) => {
      const row = o as Record<string, unknown>
      const objection = str(row.objection, 200)
      const response = str(row.response, 400)
      return objection && response ? { objection, response } : null
    })
    .filter((o): o is NonNullable<typeof o> => o !== null)
    .slice(0, 5)

  const ammunition = (Array.isArray(r.ammunition) ? r.ammunition : [])
    .map((a) => {
      const row = a as Record<string, unknown>
      const beatId = str(row.beatId, 40)
      const point = str(row.point, 200)
      return beatId && point ? { beatId, point } : null
    })
    .filter((a): a is NonNullable<typeof a> => a !== null)
    .slice(0, 6)

  return {
    version: 1,
    generatedAt: str(r.generatedAt, 40) ?? new Date(0).toISOString(),
    model: 'sonnet',
    openingLine,
    walkUpStory,
    beatEmphasis,
    objections,
    ammunition,
    closingAsk,
  }
}

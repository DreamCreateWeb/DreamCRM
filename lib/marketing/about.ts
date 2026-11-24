import { COMPARISONS } from '@/lib/marketing/comparisons'
import { OPERATOR } from '@/lib/marketing/legal'
import { buildListingKit } from '@/lib/marketing/listing-kit'
import { MARKETING, TRIAL } from '@/lib/marketing/site'

/**
 * /about — WHICH DREAMCRM THIS IS, in sentences an assistant can lift.
 *
 * WHY THE PAGE EXISTS. Unrelated products are also called DreamCRM, and on
 * 2026-11-24 no search engine or assistant we checked named this one for any
 * buyer question (docs/organic-go-live.md Part 1). What an assistant says
 * about a product is assembled from pages that state facts plainly — and the
 * site had no page whose job was to state them: the home page argues, the
 * product tour shows, the pricing page prices. This one answers the question
 * a model, a marketplace reviewer or a careful buyer actually has: what is
 * it, who makes it, who is it for, what does it cost, what does it NOT do,
 * and is this the same DreamCRM I saw somewhere else.
 *
 * WHY IT IS BUILT FROM THE LISTING KIT. The same sentences go on G2 and every
 * other outside profile (lib/marketing/listing-kit.ts). A product described
 * one way on its own site and another way on a marketplace gives a reader two
 * things to reconcile; described identically, each page corroborates the
 * other. So this file writes almost nothing of its own — it arranges the
 * kit's fields and the resolved trial terms, and adds the two things only our
 * own site can say: who operates it, and that the name is shared.
 *
 * WHAT IT DOES NOT SAY. It does not name the person who operates Dream
 * Create: the Privacy Policy does, as it must, and whether a marketing page
 * should is an open owner ruling (docs/organic-go-live.md Part 8). It gives
 * the town, not the street. It names no other "DreamCRM" — saying which
 * products we are not would be publishing claims about strangers.
 */

export interface AboutFact {
  term: string
  detail: string
}

export interface AboutDoc {
  path: '/about'
  /** The page's first heading — a definition, not a slogan. */
  title: string
  /** Under the heading. */
  summary: string
  facts: AboutFact[]
  included: string[]
  notIncluded: string[]
  /** The shared-name note. */
  sameName: string[]
  compare: Array<{ name: string; href: string }>
}

const US_STATE: Record<string, string> = { AR: 'Arkansas' }

/** "Ward, AR 72176" → "Ward, Arkansas". The town and the state, never the
 *  street or the ZIP — and never typed a second time. */
export function operatorPlace(cityLine: string = OPERATOR.cityLine): string {
  const m = /^(.+),\s*([A-Z]{2})\b/.exec(cityLine)
  if (!m) return cityLine
  return `${m[1]}, ${US_STATE[m[2]] ?? m[2]}`
}

export function buildAbout(): AboutDoc {
  const kit = buildListingKit()
  const field = (id: string) => {
    const f = kit.fields.find((x) => x.id === id)
    if (!f) throw new Error(`about: the listing kit lost its "${id}" field`)
    return f.text
  }
  const name = MARKETING.productName

  return {
    path: '/about',
    title: `${name} is front-office software for dental practices`,
    summary: field('short'),
    facts: [
      { term: 'What it is', detail: field('one-line') },
      {
        term: 'Who makes it',
        detail: `${OPERATOR.business}, in ${operatorPlace()}. ${name} is built only for dental practices.`,
      },
      { term: 'Who it is for', detail: field('audience') },
      { term: 'What it costs', detail: field('pricing') },
      { term: 'The free trial', detail: `A ${TRIAL.name}. ${TRIAL.cardTerms}` },
      {
        term: 'What it works with',
        detail: 'Dentrix, Eaglesoft and other dental practice management systems, through NexHealth. It works alongside that system and does not replace it.',
      },
    ],
    included: kit.features,
    notIncluded: kit.notIncluded,
    sameName: [
      `Other, unrelated products are also called ${name}. This one is made by ${OPERATOR.business}, is built only for dental practices, and lives at ${kit.website.replace(/^https?:\/\//, '')}.`,
      `If a page about a “${name}” does not mention dentistry, it is describing something else.`,
    ],
    compare: COMPARISONS.map((c) => ({ name: c.name, href: `/compare/${c.slug}` })),
  }
}

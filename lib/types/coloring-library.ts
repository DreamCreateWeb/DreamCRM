/**
 * The platform coloring-page library — vetted public-domain/CC0 line art
 * every clinic can add to their kids' corner alongside their own uploads.
 *
 * Assets live in `public/images/coloring-library/` (under `/images/` so the
 * middleware matcher's static exclusion serves them on clinic subdomains +
 * custom domains without entering the rewrite). Each entry records its
 * provenance: source page URL + the license as stated at ingestion time.
 * CC0/public domain only — commercial use + redistribution without
 * attribution — so clinic sites carry no license burden. Client-safe (the
 * Studio editor renders the picker from this registry).
 */
export interface ColoringLibraryEntry {
  /** Stable slug — doubles as the asset filename + the seeded item id. */
  slug: string
  /** Friendly display title ("Happy Tooth"). */
  title: string
  /** Source page the asset was ingested from (provenance, not attribution —
   *  CC0 requires none). */
  sourceUrl: string
  sourceSite: string
  /** License as stated by the source at ingestion time. */
  license: string
  /** Theme tags for the picker ('dental', 'animals', 'space', …). */
  themes: string[]
}

export function coloringLibraryUrl(slug: string): string {
  return `/images/coloring-library/${slug}.svg`
}

const FREESVG_CC0 = 'Public Domain / CC0 1.0 (per-item license meta on the source page)'
const OPENCLIPART_CC0 = 'CC0 1.0 Public Domain (all Openclipart is CC0)'

/** The vetted CC0 pack — 20 pages, visually curated from ~70 candidates
 *  (see docs/HISTORY.md — coloring library ingestion). Alphabetized by slug. */
export const COLORING_LIBRARY: ColoringLibraryEntry[] = [
  { slug: 'big-smile-teeth', title: 'Big Happy Smile', sourceUrl: 'https://freesvg.org/mouth-with-teeth-vector-image', sourceSite: 'freesvg.org', license: FREESVG_CC0, themes: ['smile', 'tooth'] },
  { slug: 'butterfly', title: 'Beautiful Butterfly', sourceUrl: 'https://freesvg.org/line-art-butterfly-vector-image', sourceSite: 'freesvg.org', license: FREESVG_CC0, themes: ['butterfly'] },
  { slug: 'car', title: 'Little Car', sourceUrl: 'https://freesvg.org/automobile-vector-outline-image', sourceSite: 'freesvg.org', license: FREESVG_CC0, themes: ['car'] },
  { slug: 'cat-face', title: 'Kitty Face', sourceUrl: 'https://freesvg.org/cat-line-art', sourceSite: 'freesvg.org', license: FREESVG_CC0, themes: ['cat'] },
  { slug: 'caticorn', title: 'Caticorn', sourceUrl: 'https://freesvg.org/cat-with-horn-drawing', sourceSite: 'freesvg.org', license: FREESVG_CC0, themes: ['cat', 'unicorn'] },
  { slug: 'dog', title: 'Playful Pup', sourceUrl: 'https://freesvg.org/vector-line-drawing-of-a-dog', sourceSite: 'freesvg.org', license: FREESVG_CC0, themes: ['dog'] },
  { slug: 'elephant-circle', title: 'Little Elephant', sourceUrl: 'https://freesvg.org/line-art-vector-illustration-elephant-sitting', sourceSite: 'freesvg.org', license: FREESVG_CC0, themes: ['elephant'] },
  { slug: 'happy-tooth', title: 'Happy Tooth', sourceUrl: 'https://freesvg.org/happy-tooth-vector-clip-art', sourceSite: 'freesvg.org', license: FREESVG_CC0, themes: ['tooth', 'smile', 'dental'] },
  { slug: 'princess', title: 'Little Princess', sourceUrl: 'https://freesvg.org/cute-princess', sourceSite: 'freesvg.org', license: FREESVG_CC0, themes: ['princess', 'castle'] },
  { slug: 'retro-rocket', title: 'Blast-Off Rocket', sourceUrl: 'https://freesvg.org/line-art-vector-image-of-space-rocket-ship', sourceSite: 'freesvg.org', license: FREESVG_CC0, themes: ['rocket', 'space'] },
  { slug: 'robot-rb1', title: 'Robot RB-1', sourceUrl: 'https://freesvg.org/robot-vector-drawing', sourceSite: 'freesvg.org', license: FREESVG_CC0, themes: ['robot'] },
  { slug: 'rocket', title: 'Rocket Ship', sourceUrl: 'https://freesvg.org/line-art-rocket-vector-drawing', sourceSite: 'freesvg.org', license: FREESVG_CC0, themes: ['rocket', 'space'] },
  { slug: 'sandcastle', title: 'Sandcastle', sourceUrl: 'https://freesvg.org/vector-image-of-castle', sourceSite: 'freesvg.org', license: FREESVG_CC0, themes: ['castle'] },
  { slug: 'shaggy-dog', title: 'Shaggy Dog', sourceUrl: 'https://freesvg.org/coloring-book-dog-vector-image', sourceSite: 'freesvg.org', license: FREESVG_CC0, themes: ['dog'] },
  { slug: 'smiling-boy', title: 'Happy Kid', sourceUrl: 'https://freesvg.org/young-boy-smiling-outline-vector-image', sourceSite: 'freesvg.org', license: FREESVG_CC0, themes: ['smile'] },
  { slug: 'smiling-sun', title: 'Sunny the Sun', sourceUrl: 'https://freesvg.org/sun-line-art-vector-graphics', sourceSite: 'freesvg.org', license: FREESVG_CC0, themes: ['sun'] },
  { slug: 'smiling-tooth', title: 'Smiley the Tooth', sourceUrl: 'https://freesvg.org/anthropomorphic-tooth', sourceSite: 'freesvg.org', license: FREESVG_CC0, themes: ['tooth', 'smile', 'dental'] },
  { slug: 'stegosaurus', title: 'Stegosaurus', sourceUrl: 'https://freesvg.org/stegosaurus-3', sourceSite: 'freesvg.org', license: FREESVG_CC0, themes: ['dinosaur'] },
  { slug: 'tooth-with-toothbrush', title: 'Brushing Buddy', sourceUrl: 'https://openclipart.org/detail/352774/cute-anthropomorphic-tooth-with-toothbrush', sourceSite: 'openclipart.org', license: OPENCLIPART_CC0, themes: ['tooth', 'toothbrush', 'smile', 'dental'] },
  { slug: 'toy-robot', title: 'Tin Toy Robot', sourceUrl: 'https://freesvg.org/old-toy-robot', sourceSite: 'freesvg.org', license: FREESVG_CC0, themes: ['robot'] },
]

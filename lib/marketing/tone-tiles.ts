/**
 * THE TONE-TILE VOCABULARY — `BRAND.md` Part 3, the owner's second veto.
 *
 * The subject list and its tone mapping. The DRAWINGS live beside the
 * component in `components/marketing/ui.tsx`, and the split is deliberate
 * rather than tidy-minded: marketing CONTENT files name a glyph on the line
 * it belongs to (`lib/marketing/comparisons.ts` does, and `ui.tsx` imports
 * that file), so a union declared in `ui.tsx` would make every content file
 * that carries a subject import the component that renders it. That is a
 * cycle, and the `import type` that hides it at runtime hides it from the
 * reader too.
 *
 * NOTHING CAN DRIFT ACROSS THE SPLIT. Both halves are keyed
 * `Record<ToneTileGlyph, …>` — the tone map here, the path map there — so a
 * glyph added to the union without a tone, or with a tone but no drawing,
 * does not compile. The exhaustiveness IS the guard; there is no list to keep
 * in sync by hand.
 *
 * WHY THE TONE IS A PROPERTY OF THE SUBJECT AND NOT AN ARGUMENT. A call site
 * that can choose its own tone will eventually choose a different one for the
 * same subject, and then "which colour is payments" has two answers — the
 * exact failure `TONE_FILL` was created for (rule 5 in
 * `tests/a11y/class-pairs.ts`). So a call site names a subject and the colour
 * comes with it.
 *
 * THE THREE TONES, AND THE THREE THAT ARE MISSING:
 *
 *   - `brand`  — what the product IS: every surface, every module, and the
 *                honesty terms. `BRAND.md` Part 2 says the brand hue is never
 *                a status, and honest-by-default is identity, not a state.
 *   - `growth` — what it earns you: money, reputation, loyalty, analytics.
 *   - `auto`   — what it does without you: sync, automation, campaigns.
 *
 * `rose` and `amber` are excluded because they are the tone registry's urgency
 * signals, and nothing on a marketing benefit list is urgent or needs the
 * reader's action — borrowing them here is how a status ramp stops meaning a
 * status. `fuchsia` is excluded because Part 2 gives it exactly two homes, the
 * celebration accent and the headline gradient's terminal stop, and a feature
 * bullet is neither; it is also "never on pricing", which is where a third of
 * these tiles live.
 */

export type ToneTileGlyph =
  /* brand — what the product is */
  | 'calendar' | 'chat' | 'globe' | 'people' | 'form' | 'layers' | 'clock'
  | 'key' | 'shield' | 'door' | 'flag' | 'tag' | 'sliders' | 'eye'
  | 'pencil' | 'tooth'
  /* auto — what it does without you */
  | 'sync' | 'bolt' | 'megaphone'
  /* growth — what it earns you */
  | 'money' | 'chart' | 'cart' | 'gift' | 'star'

export type TileTone = 'brand' | 'growth' | 'auto'

/** Which family each subject belongs to. */
export const TONE_TILE_TONE: Record<ToneTileGlyph, TileTone> = {
  calendar: 'brand',
  chat: 'brand',
  globe: 'brand',
  people: 'brand',
  form: 'brand',
  layers: 'brand',
  clock: 'brand',
  key: 'brand',
  shield: 'brand',
  door: 'brand',
  flag: 'brand',
  tag: 'brand',
  sliders: 'brand',
  eye: 'brand',
  pencil: 'brand',
  tooth: 'brand',

  sync: 'auto',
  bolt: 'auto',
  megaphone: 'auto',

  money: 'growth',
  chart: 'growth',
  cart: 'growth',
  gift: 'growth',
  star: 'growth',
}

/**
 * THE CONTRAST SHAPE, AND IT IS PART 7's — arrived at the way the cinema
 * stage's avatars were: a tone TINT carrying that tone's DEEP INK, never white
 * on the tone. Measured through `tests/a11y/palette.ts`, the resolver the
 * guards themselves use:
 *
 * | tile | ratio |
 * |---|---|
 * | `teal-800` on `teal-200` | **6.49** |
 * | `violet-800` on `violet-200` | **5.75** |
 * | `emerald-800` on `emerald-200` | **5.95** |
 *
 * **The `-800` ink, not the `-700`** — the same call the cinema stage made and
 * for the same reason. On these tints `-700` gives 4.81 / 4.35 / 4.16: two of
 * the three are already UNDER the floor, and the one that clears does so by
 * 0.31. A tile that close to the line is the "4.18 reads as passing" shape
 * waiting for somebody to warm the tint.
 *
 * **The `-200` tint keeps this outside rule 5 BY CONSTRUCTION**, which is
 * exactly what Part 7's "Rule 5 and the tone tiles" predicted it would.
 * `FILL_STEPS` is 300–600; 200 is the tone WASH end, where the night band's
 * chips sat. A tile that ever needs a SOLID tone fill extends `TONE_FILL`
 * rather than growing a local recipe — Part 7 and DREAMCRM-71 both say so.
 *
 * `-200` rather than `-100` is a taste call with a number under it: against
 * the white and `gray-50` cards these tiles sit on, `-100` reads 1.14–1.27,
 * and a tile you cannot quite see is Part 1's third "not us" — bland — which
 * is the specific way this direction fails. `-200` reads 1.28–1.53: present
 * without shouting.
 */
export const TILE_TONE_CLASSES: Record<TileTone, { tile: string; dash: string }> = {
  brand: { tile: 'bg-teal-200 text-teal-800', dash: 'bg-teal-500' },
  growth: { tile: 'bg-emerald-200 text-emerald-800', dash: 'bg-emerald-500' },
  auto: { tile: 'bg-violet-200 text-violet-800', dash: 'bg-violet-500' },
}

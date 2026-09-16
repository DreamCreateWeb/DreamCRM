'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { DAY_WIRE, MONO_LABEL } from '@/components/marketing/ui'

/**
 * THE CHAPTER RAIL — `BRAND.md` Part 8 move 6, page 3.
 *
 * The product tour is ten chapters and the longest page on the site, which
 * makes it the one page where "where am I, and how much is left" is a real
 * question rather than a nicety. It already had a sticky module nav; what it
 * did not have was any answer to that question — ten grey pills, none of which
 * ever changed, so the rail told you what existed and never where you were.
 *
 * WHAT IS NEW IS THE ANSWER, NOT THE BAR. The active chapter takes the
 * HEADER's own active treatment (`MarketingHeader`'s 2px
 * `teal-600 → violet-700 → fuchsia-700` underline) rather than a second
 * invention — a site whose Part 1 word for itself is *precise* should not have
 * two ways of saying "you are here." Everything else is Part 2's daylight
 * vocabulary: `DAY_WIRE` hairlines instead of `gray-100`, mono micro-labels
 * (Part 4) instead of 0.82rem sans, 10px radius (Part 3's controls step)
 * instead of the dashboard's `rounded-lg`.
 *
 * THE CHIPS CARRY NO NUMERAL, and that is a measurement rather than a taste
 * call. Ten numbered chips do not fit the `max-w-6xl` column at 1440 — the
 * rail arrives at the widest width already cut off, which reads as broken
 * rather than as scrollable — and the number is two lines below anyway, on the
 * chapter mark the reader is looking at. Part 4's veto names two homes for a
 * chapter number ("the eyebrow and the chapter rail"); this rail's job is
 * WHICH chapter, and the mark's is which OF HOW MANY.
 *
 * ── WHY AN OBSERVER AND NOT A SCROLL HANDLER ──────────────────────────────
 *
 * `IntersectionObserver` with a top-biased `rootMargin` asks the browser the
 * question directly — "which chapter is under the chrome right now" — instead
 * of recomputing ten `getBoundingClientRect()`s on every scroll tick. The
 * margin is the chrome's own height: the 60px header plus this rail, so a
 * chapter becomes current when its heading clears the furniture rather than
 * when its top edge touches the bottom of the window.
 *
 * NO MOTION IS INVOLVED, so there is nothing for `prefers-reduced-motion` to
 * turn off in the highlight itself (Part 6) — the underline is an opacity
 * change on a 200ms ease, the same band the header's is. The one thing that
 * DOES move is the rail scrolling itself sideways to keep the current chapter
 * visible on a phone, and that honours the preference: `smooth` when motion is
 * welcome, an instant jump when it is not.
 *
 * AND IT DEGRADES TO EXACTLY THE OLD BEHAVIOUR. Server-rendered, no chapter is
 * active; without `IntersectionObserver` none ever becomes active. The rail is
 * ten links to ten anchors either way — the highlight is a second channel for
 * the eye, never the navigation itself.
 *
 * ── THE FILL IS OPAQUE, AND THAT IS A CONTRAST DECISION ───────────────────
 *
 * The bar this replaces was `bg-white/90 backdrop-blur` — a SECOND translucent
 * sticky surface on the marketing site, and one no instrument in the repo
 * could see. `token-contrast.test.ts` grades the header's `white/85` by
 * arithmetic against the darkest thing it crosses precisely because axe,
 * `dark-mode-parity` and every rule in `class-pairs.ts` correctly decline to
 * grade ink against a SIBLING scrolling underneath it; that guard is anchored
 * to `chrome.tsx` and asserts it finds exactly one alpha there, so it was
 * never going to see this one.
 *
 * Going opaque answers it instead of guarding it, which is what that test's
 * own docblock says the alternative is: *"None means it went opaque (its ink
 * is then graded against a declared token…)"*. On `bg-white` the inactive
 * chips are `gray-600` at 6.91 and the active one `teal-700` at 7.05, both
 * flat, both visible to the source rules and to axe. The page keeps a glass
 * bar — the header directly above is still `white/85` and still graded. What
 * it does not keep is a translucent surface nothing measures, which is the
 * shape Part 7 spends most of its length on.
 */
export default function ChapterRail({
  chapters,
}: {
  chapters: Array<{ id: string; label: string }>
}) {
  const [active, setActive] = useState<string | null>(null)
  /** Whether the track has scroll left in it, each side asked separately. */
  const [edges, setEdges] = useState({ start: false, end: false })
  const trackRef = useRef<HTMLDivElement | null>(null)

  const readEdges = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    const max = track.scrollWidth - track.clientWidth
    // 2px of slack: sub-pixel layout leaves `scrollLeft` a hair short of `max`
    // at the far end, and a fade that never quite goes out is a fade that is
    // lying about there being more.
    const next = { start: track.scrollLeft > 2, end: track.scrollLeft < max - 2 }
    setEdges((prev) =>
      prev.start === next.start && prev.end === next.end ? prev : next,
    )
  }, [])

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return

    /** Which chapters currently qualify; the FIRST in document order wins, so
     *  scrolling back up hands the title to the chapter you are re-entering
     *  rather than to the one you are leaving. */
    const live = new Set<string>()

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id
          if (entry.isIntersecting) live.add(id)
          else live.delete(id)
        }
        const next = chapters.find((c) => live.has(c.id))?.id ?? null
        setActive((prev) => (prev === next ? prev : next))
      },
      // Top: PAST the chrome, not level with it. The sections carry
      // `scroll-mt-[7rem]` (112px — the 60px header plus this rail), so
      // clicking a chip lands that section's top edge at exactly 112 and the
      // PREVIOUS section's bottom edge there too. At a line of exactly 112
      // both qualify, `find` takes the earlier one, and tapping a chapter
      // highlights the one above it — measured, not hypothesised. The extra
      // 12px puts the line inside the landed section and outside its
      // predecessor. Bottom: -55% keeps a chapter from claiming the rail
      // while it is still only a sliver at the foot of the window.
      { rootMargin: '-124px 0px -55% 0px', threshold: 0 },
    )

    const nodes = chapters
      .map((c) => document.getElementById(c.id))
      .filter((n): n is HTMLElement => n !== null)
    for (const node of nodes) observer.observe(node)
    return () => observer.disconnect()
  }, [chapters])

  /**
   * Keep the current chapter in view inside the rail — the half of this that
   * matters on a phone, where nine of the ten chips are off-screen.
   *
   * `scrollLeft` is set on the TRACK directly rather than calling
   * `scrollIntoView` on the chip: that method walks every scrollable ancestor,
   * so on a narrow window it would also scroll the PAGE — the rail would drag
   * the reader around while they were reading. This touches one element's one
   * axis and can do nothing else.
   */
  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    // No active chapter means the reader is above the first one — in the
    // hero. The rail rewinds rather than keeping whatever chapter it was
    // showing when they last jumped to the top, which is a stale answer to
    // the only question it asks.
    const chip = active
      ? track.querySelector<HTMLElement>(`[data-chapter="${active}"]`)
      : null
    if (active && !chip) return
    const target = chip
      ? chip.offsetLeft - (track.clientWidth - chip.offsetWidth) / 2
      : 0
    const max = track.scrollWidth - track.clientWidth
    const left = Math.max(0, Math.min(max, target))
    if (Math.abs(left - track.scrollLeft) < 4) return
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    track.scrollTo({ left, behavior: reduced ? 'auto' : 'smooth' })
  }, [active])

  /**
   * The edges at rest. Scrolling is covered by the track's own `onScroll`;
   * this is every other way the answer can change.
   *
   * `document.fonts.ready` IS THE LOAD-BEARING LINE, and it is here because
   * the first draft was measurably wrong without it. These chips are set in
   * Geist Mono (Part 4's micro-label), which arrives after hydration — so a
   * mount-time measurement grades the FALLBACK face's width, decides the rail
   * fits, and nothing ever fires again to correct it once the real font makes
   * it 131px too wide. The fade stayed off at 1440 with a word sliced in half
   * underneath it, which is the exact failure it exists to prevent.
   */
  useEffect(() => {
    readEdges()
    window.addEventListener('resize', readEdges)
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
    fonts?.ready.then(readEdges).catch(() => {})
    return () => window.removeEventListener('resize', readEdges)
  }, [readEdges])

  return (
    <nav
      className="sticky top-[60px] z-30 border-b bg-white"
      style={{ borderBottomColor: DAY_WIRE }}
      aria-label="Chapters"
    >
      <div className="relative mx-auto max-w-6xl">
        <div
          ref={trackRef}
          onScroll={readEdges}
          className="no-scrollbar flex gap-0.5 overflow-x-auto px-4 py-1.5 sm:px-6"
        >
          {chapters.map((c) => {
            const on = c.id === active
            return (
              <a
                key={c.id}
                href={`#${c.id}`}
                data-chapter={c.id}
                aria-current={on ? 'true' : undefined}
                className={`relative shrink-0 rounded-[10px] px-2 py-2 transition-colors duration-200 ease-out ${MONO_LABEL} ${
                  on ? 'text-teal-700' : 'text-gray-600 hover:bg-teal-50 hover:text-teal-700'
                }`}
              >
                {c.label}
                {/* The header's own active mark, inherited rather than reinvented.
                    `aria-hidden` because `aria-current` above already says this
                    to a screen reader, and a 2px rule has nothing to add to it. */}
                <span
                  className={`pointer-events-none absolute inset-x-2 bottom-[3px] h-[2px] rounded-full bg-gradient-to-r from-teal-600 via-violet-700 to-fuchsia-700 transition-opacity duration-200 ease-out ${
                    on ? 'opacity-100' : 'opacity-0'
                  }`}
                  aria-hidden="true"
                />
              </a>
            )
          })}
        </div>

        {/* ── THE EDGES ───────────────────────────────────────────────────
               Ten chapters do not fit the reading column at any width the
               site supports, so this rail always has more to one side — and
               a word sliced off at the container's edge reads as broken
               rather than as scrollable. These two say "there is more that
               way" instead. They are MEASURED, never assumed: each renders
               only while that side actually has scroll left in it, so a
               shorter tour would simply never paint one.

               A plain two-stop `bg-gradient-to-*` and no `background-size`,
               which is what keeps it on the right side of Part 3's lattice
               rule (`no-drawn-grid.test.ts` looks for a gradient repeating
               on a fixed pitch; this one has no pitch to repeat on). ── */}
        <div
          className={`pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-white to-transparent transition-opacity duration-200 ease-out ${
            edges.start ? 'opacity-100' : 'opacity-0'
          }`}
          aria-hidden="true"
        />
        <div
          className={`pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white to-transparent transition-opacity duration-200 ease-out ${
            edges.end ? 'opacity-100' : 'opacity-0'
          }`}
          aria-hidden="true"
        />
      </div>
    </nav>
  )
}

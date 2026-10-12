/**
 * THE BOTTOM BAR INSET (2026-10-12). Three templates pin a full-width Call /
 * Book bar to the bottom edge on phones (cosmetic, hometown, pediatric) and
 * two things float in the bottom-left corner on every template — the chat
 * bubble and Cherry's "Pay over time" button — which were sitting ON those
 * bars. The bars are template-owned and the floaters are shared, so neither
 * side can hardcode the other: every full-width bottom bar carries
 * `data-site-bottom-bar`, `BottomBarInset` (the layout) measures how far up
 * the viewport the tallest visible one reaches and writes it to
 * `--site-bottom-bar` on <html>, and each floater adds that to its own
 * bottom offset through `bottomBarOffset`. A template with no bar, or a bar
 * hidden at the `sm` breakpoint, measures 0 and nothing moves.
 */
export const BOTTOM_BAR_ATTR = 'data-site-bottom-bar'
export const BOTTOM_BAR_VAR = '--site-bottom-bar'

/** A `bottom` value: the floater's own offset plus whatever bar is under it. */
export function bottomBarOffset(px: number): string {
  return `calc(${px}px + var(${BOTTOM_BAR_VAR}, 0px))`
}

import type { ReactNode } from 'react'

/**
 * THE busy affordance — one shape, every button system.
 *
 * The dashboard (`ActionButton`), the patient portal (`BrandButton`,
 * `GhostButton`, the visit card's `ActionPill`) and the public clinic site
 * all need the same three things when an action is in flight, and they had
 * been getting none of them outside the dashboard:
 *
 *   1. the label STAYS in the layout at `opacity-0`, so the button's width
 *      never jumps mid-press — a label swap reflows the control under the
 *      thumb that is still on it, which is exactly when an older patient
 *      taps a second time;
 *   2. a spinner overlays it, ringing in `currentColor` so it is tinted by
 *      whatever button it sits in — white on a clinic's brand fill, muted
 *      ink on a ghost, the dashboard's teal on a dashboard primary. That is
 *      why this component carries NO colour of its own: the portal and the
 *      site cannot take the dashboard's teal, and shouldn't have to;
 *   3. `Working…` for a screen reader, which a `{pending ? 'Sending…' : …}`
 *      ternary never announced at all.
 *
 * The caller owns `aria-busy`, `disabled` and `position: relative` on the
 * button; this owns what goes inside it. Reduced motion stills the spinner
 * (`.btn-spinner` in app/css/style.css).
 */
export function BusyLabel({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Held in the layout, invisible — this is what stops the reflow. */}
      <span className="opacity-0" aria-hidden>
        {children}
      </span>
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="btn-spinner" aria-hidden />
        <span className="sr-only">Working…</span>
      </span>
    </>
  )
}

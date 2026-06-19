/**
 * "Skip to content" link — a WCAG 2.4.1 (Bypass Blocks) bypass so keyboard and
 * screen-reader users can jump straight past the sidebar to the page content
 * instead of tabbing through every nav item on every page. Visually hidden
 * until focused, then it appears as the first thing on the page. Targets the
 * focusable <main id="main-content"> landmark in the shell.
 */
export function SkipToContent({ targetId = 'main-content' }: { targetId?: string }) {
  return (
    <a
      href={`#${targetId}`}
      className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[200] focus:rounded-lg focus:bg-teal-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg"
    >
      Skip to content
    </a>
  )
}

export default SkipToContent

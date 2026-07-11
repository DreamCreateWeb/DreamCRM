import type { TemplateFontLink } from '@/lib/site-templates/types'

/**
 * Runtime font loader for the active site template — a standard <link> tag
 * rather than `next/font/google`, which fetches font files at BUILD TIME and
 * broke the App Runner CodeBuild pipeline once (PR #166: no reliable outbound
 * to fonts.googleapis.com in the build env). The <link> defers the fetch to
 * the browser, which always works.
 *
 * NON-render-blocking: a normal stylesheet <link> blocks first paint until the
 * CSS downloads — over a slow connection that delays the whole page on a
 * decorative display font. We load it with `media="print"` (browsers fetch it
 * at low priority WITHOUT blocking render) then flip it to `media="all"` once
 * it loads via a tiny inline handler. The Georgia fallback in the template's
 * `--font-display` covers the brief swap window, and a <noscript> keeps it
 * working with JS disabled.
 */
export default function TemplateFontLinks({ fonts }: { fonts: TemplateFontLink[] }) {
  if (fonts.length === 0) return null
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {fonts.map((f) => (
        <link key={f.id} id={f.id} rel="stylesheet" href={f.href} media="print" />
      ))}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){${JSON.stringify(fonts.map((f) => f.id))}.forEach(function(id){var l=document.getElementById(id);if(!l)return;function s(){l.media='all'}if(l.sheet){s()}else{l.addEventListener('load',s);l.addEventListener('error',s)}})})();`,
        }}
      />
      <noscript>
        {/* No JS → load them the normal (blocking) way so the fonts still apply. */}
        {fonts.map((f) => (
          // eslint-disable-next-line @next/next/no-page-custom-font
          <link key={f.id} rel="stylesheet" href={f.href} />
        ))}
      </noscript>
    </>
  )
}

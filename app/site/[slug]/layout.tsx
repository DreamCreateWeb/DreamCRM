/**
 * Site-wide layout for clinic public pages (/site/[slug]/...). Loads the
 * Fraunces serif used for display headings (hero H1 + section H2s) via a
 * standard <link> tag rather than `next/font/google`.
 *
 * Why the link approach: `next/font/google` fetches font files at BUILD
 * TIME and self-hosts them. That's nice for perf but it's brittle in
 * build environments without reliable outbound access to
 * fonts.googleapis.com — which is exactly what broke the App Runner
 * CodeBuild pipeline on the first attempt (PR #166). The <link> tag
 * defers the fetch to the user's browser, which always works, at the
 * cost of a small layout shift before the font loads (mitigated by the
 * Georgia fallback that's already wired into the template's inline
 * style).
 *
 * Inter for body text is loaded globally by the root layout, so we don't
 * need to touch it here.
 */
export default function ClinicSiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&display=swap"
      />
      <style>{`:root { --font-display: 'Fraunces', Georgia, serif; }`}</style>
      {children}
    </>
  )
}

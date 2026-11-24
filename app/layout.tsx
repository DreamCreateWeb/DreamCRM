import './css/style.css'

import localFont from 'next/font/local'
import { GeistMono } from 'geist/font/mono'
import Theme from './theme-provider'
import AppProvider from './app-provider'
import ChunkReloadGuard from '@/components/chunk-reload-guard'

/**
 * GEIST SANS IS A FALLBACK, SO IT IS DECLARED AND NOT PRELOADED.
 *
 * The dashboard's face is Nunito; Geist Sans sits second in
 * `--font-sans-dashboard` (DESIGN-SYSTEM.md: "stays in the stack as
 * fallback") and no public surface reads it at all — marketing and the clinic
 * sites are Inter, the labels and numerals are Geist MONO. It used to come
 * from `geist/font/sans`, whose font object preloads by default, and because
 * the import lives in the ROOT layout that put a 70 KB high-priority font
 * request on every page of the platform: the marketing site, every clinic's
 * public site, the patient portal. A font no visitor would ever see, ahead of
 * the content they came for, on the connection where it costs most (site
 * audit 2026-11-23: mobile LCP over the 2.5 s line on both pages measured).
 *
 * Same file, same variable, same weights as the package's own definition —
 * so the stack is unchanged and `var(--font-geist-sans)` still resolves. The
 * one difference is `preload: false`: the browser fetches it only if a glyph
 * actually falls through to it. Geist Mono stays preloaded, because it is
 * above the fold on the marketing pages (the eyebrow and the trust row).
 */
const GeistSans = localFont({
  src: '../node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2',
  variable: '--font-geist-sans',
  weight: '100 900',
  preload: false,
})

export const metadata = {
  // Absolute base for OG/twitter image URLs (Next falls back to localhost
  // without it on non-Vercel hosts — verified broken in prod before this).
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.dreamcreatestudio.com'),
  title: 'DreamCRM',
  description: 'DreamCRM Admin Dashboard',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Geist font variables are declared globally on <html> (just CSS custom
  // properties — harmless everywhere); only the `.v2-app` dashboard/auth/
  // onboarding shells actually CONSUME them, so the public site / portal /
  // marketing keep Inter/Fraunces.
  return (
    // suppressHydrationWarning: https://github.com/vercel/next.js/issues/44343
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body className="font-inter antialiased bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400">
        {/* Text-size preference — applied BEFORE paint (same trick next-themes
            uses for dark mode) so a larger-text user never sees a small-text
            flash. Per device by design: vision needs follow the person's
            screen, not their account. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var s=localStorage.getItem('dc-text-size');if(s==='lg'||s==='xl')document.documentElement.classList.add('dc-text-'+s)}catch(e){}})();",
          }}
        />
        {/* Auto-recovers from stale-chunk 404s after a deploy (one guarded
            reload) so a subscriber never hits the fatal client-side error. */}
        <ChunkReloadGuard />
        <Theme>
          <AppProvider>
            {children}
          </AppProvider>
        </Theme>
      </body>
    </html>
  )
}

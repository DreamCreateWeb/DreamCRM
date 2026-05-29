import { Fraunces, Inter } from 'next/font/google'

/**
 * Site-wide layout for clinic public pages (/site/[slug]/...). Loads the
 * Fraunces serif used for display headings (hero H1 + section H2s) and the
 * Inter sans used for everything else. Both surface as CSS vars
 * `--font-display` / `--font-sans` so the template can switch between them
 * with utility classes (`font-display`, `font-sans`).
 *
 * Adding a real serif here is the main typography move that closes the gap
 * to Tend's hero — their display headlines lean into a warm serif while
 * body copy stays sans. Sans-only headings read as "tech company" rather
 * than "modern healthcare DTC".
 */
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '600', '700'],
  display: 'swap',
  axes: ['SOFT', 'opsz'],
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

export default function ClinicSiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${fraunces.variable} ${inter.variable}`}>
      {children}
    </div>
  )
}

import { MarketingHeader } from '@/components/marketing/chrome'
import { MarketingFooter, MarketingMotionStyles } from '@/components/marketing/ui'
import { JsonLd, organizationLd, websiteLd } from '@/lib/marketing/seo'

/**
 * Chrome for every public marketing page (home, product, pricing, compare,
 * docs, blog). B2B SaaS register — distinct from the warm patient-facing
 * design the clinic sites use, because the audience here is a practice
 * owner evaluating software.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white text-gray-950 antialiased">
      {/* Sitewide structured data (Organization + WebSite). */}
      <JsonLd data={[organizationLd(), websiteLd()]} />
      {/* Keyboard/screen-reader skip link — first focusable element. */}
      <a
        href="#main-content"
        className="sr-only rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to content
      </a>
      <MarketingMotionStyles />
      <MarketingHeader />
      <main id="main-content">{children}</main>
      <MarketingFooter />
    </div>
  )
}

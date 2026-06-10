import { MarketingHeader } from '@/components/marketing/chrome'
import { MarketingFooter, MarketingMotionStyles } from '@/components/marketing/ui'

/**
 * Chrome for every public marketing page (home, product, pricing, compare,
 * docs, blog). B2B SaaS register — distinct from the warm patient-facing
 * design the clinic sites use, because the audience here is a practice
 * owner evaluating software.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white text-gray-950 antialiased">
      <MarketingMotionStyles />
      <MarketingHeader />
      <main>{children}</main>
      <MarketingFooter />
    </div>
  )
}

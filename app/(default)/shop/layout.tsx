import FeatureGate from '@/components/feature-switch/feature-gate'
import ShopIntro from './intro'

// THE DOOR (docs/ACTIVATION.md law 1 + S5): this module is OFF until the
// practice turns it on; off, every path under it renders the Shop's OWN
// intro — the three steps, with Stripe's connect step done right there.
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <FeatureGate feature="shop" intro={<ShopIntro />}>
      {children}
    </FeatureGate>
  )
}

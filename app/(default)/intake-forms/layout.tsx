import FeatureGate from '@/components/feature-switch/feature-gate'
import IntakeIntro from './intro'

// THE DOOR (docs/ACTIVATION.md law 1 + S5): this module is OFF until the
// practice turns it on; off, every path under it renders the module's OWN
// intro — its real facts and setup in the intro shell — not the generic card.
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <FeatureGate feature="intake_forms" intro={<IntakeIntro />}>
      {children}
    </FeatureGate>
  )
}

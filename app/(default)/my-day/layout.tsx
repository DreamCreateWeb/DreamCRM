import FeatureGate from '@/components/feature-switch/feature-gate'

// THE DOOR (docs/ACTIVATION.md law 1, S3): this module is OFF until the
// practice turns it on; off, every path under it renders the intro card.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <FeatureGate feature="my_day">{children}</FeatureGate>
}

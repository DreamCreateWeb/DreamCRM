import FeatureGate from '@/components/feature-switch/feature-gate'

// THE DOOR (docs/ACTIVATION.md law 1): the Huddle is OFF until the practice
// turns it on — or until its patient data is connected (A1), when it opens
// on its own. Off, every path under it renders the intro card.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <FeatureGate feature="huddle">{children}</FeatureGate>
}

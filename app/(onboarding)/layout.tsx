/**
 * Onboarding route-group wrapper. Scopes the v2 dashboard UI font (Geist Sans)
 * + brand temperature to the onboarding/welcome flow via `.v2-app`, so the
 * post-signup steps read as the product. Structurally transparent — the
 * onboarding pages keep their own min-h layouts.
 */
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <div className="v2-app">{children}</div>
}

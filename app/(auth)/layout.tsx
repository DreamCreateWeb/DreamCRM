/**
 * Auth route-group wrapper. Scopes the v2 dashboard UI font (Geist Sans) +
 * brand temperature to the auth surfaces via `.v2-app`, so sign-in / sign-up /
 * reset / accept-invite read as the product (not the public site / portal).
 * Structurally transparent — the auth pages keep their own min-h layouts.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="v2-app">{children}</div>
}

// Metadata wrapper for the client-rendered invite page: token links are
// per-person and must never be indexed (robots.txt also disallows the path).
export const metadata = {
  title: 'Accept your invitation — DreamCRM',
  robots: { index: false, follow: false },
}

/**
 * accept-invite deliberately does NOT use the shared AuthShell: it's a
 * multi-state token flow (team / patient / partner branches, account
 * creation, expired/claimed states) whose chrome each state controls — the
 * one intentional divergence in the (auth) group. This layout exists only to
 * stamp noindex on a token-carrying URL.
 */
export default function AcceptInviteLayout({ children }: { children: React.ReactNode }) {
  return children
}

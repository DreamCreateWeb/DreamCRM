// Metadata wrapper for the client-rendered invite page: token links are
// per-person and must never be indexed (robots.txt also disallows the path).
export const metadata = {
  title: 'Accept your invitation — DreamCRM',
  robots: { index: false, follow: false },
}

export default function AcceptInviteLayout({ children }: { children: React.ReactNode }) {
  return children
}

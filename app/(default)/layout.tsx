import DashboardShell from '@/components/ui/dashboard-shell'

// Layout reads the active session + org; never prerender any page under it.
export const dynamic = 'force-dynamic'

export default function DefaultLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>
}

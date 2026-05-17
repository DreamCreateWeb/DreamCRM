import DashboardShell from '@/components/ui/dashboard-shell'

export const dynamic = 'force-dynamic'

export default function DoubleSidebarLayout({ children }: { children: React.ReactNode }) {
  // v2 sidebar variant matches the dual-sidebar pages (inbox/messages) chrome:
  // square corners + right border so the inner conversation sidebar nests
  // cleanly against it.
  return (
    <DashboardShell sidebarVariant="v2" headerVariant="v2">
      {children}
    </DashboardShell>
  )
}

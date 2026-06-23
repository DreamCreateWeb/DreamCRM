import DashboardShell from '@/components/ui/dashboard-shell'

export const dynamic = 'force-dynamic'

export default function DoubleSidebarLayout({ children }: { children: React.ReactNode }) {
  // v2 sidebar variant matches the dual-sidebar pages (inbox/messages) chrome:
  // square corners + right border so the inner conversation sidebar nests
  // cleanly against it. `fullHeight` bounds <main> to the viewport so these
  // two-pane apps own their own scroll regions (thread list + thread scroll
  // independently) instead of growing the shell and scrolling the whole window.
  return (
    <DashboardShell sidebarVariant="v2" headerVariant="v2" fullHeight>
      {children}
    </DashboardShell>
  )
}

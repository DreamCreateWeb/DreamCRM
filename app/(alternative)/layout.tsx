import DashboardShell from '@/components/ui/dashboard-shell'

export const dynamic = 'force-dynamic'

export default function AlternativeLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell sidebarVariant="v2" headerVariant="v3">
      {children}
    </DashboardShell>
  )
}

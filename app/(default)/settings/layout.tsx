export const dynamic = 'force-dynamic'

import { requireTenant } from '@/lib/auth/context'
import SettingsSidebar from './settings-sidebar'

/**
 * Shared chrome for every /settings page: a two-column shape — a sticky nav
 * RAIL on the left, the page's own content card(s) on the right. Rendered ONCE
 * here (not per page) so:
 *   • the rail is a clean full-height column beside the content, never a small
 *     bordered card nested inside the content panel (the old "tiny window");
 *   • the sidebar persists across settings navigations (search + width state
 *     survive moving page-to-page);
 *   • a new settings page is just a page.tsx that renders its <PageHeader> +
 *     content — it inherits the rail for free.
 *
 * Each page renders its header + its own v2-panel content card as `children`;
 * the rail sits to the left of that whole column.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireTenant()
  const showRail = ctx.tenantType === 'clinic' || ctx.tenantType === 'platform'

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <div className="flex flex-col md:flex-row md:gap-6 lg:gap-8">
        {showRail && <SettingsSidebar tenantType={ctx.tenantType} />}
        <div className="grow min-w-0">{children}</div>
      </div>
    </div>
  )
}

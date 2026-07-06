export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Presenter script — DreamCRM demo',
  robots: { index: false, follow: false },
}

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { readDemoSkin } from '@/lib/demo-skin'
import ScriptRemote from '@/components/demo/script-remote'

/**
 * The pop-out presenter script window — chrome-less (the (preview)
 * route-group pattern), opened from the presenter panel's ⧉ button onto
 * the presenter's second screen. Gated exactly like /demo/compare:
 * platform admin + demo mode, or redirect home. The skin brands the
 * script; the BroadcastChannel inside ScriptRemote drives the demo tab.
 */
export default async function DemoScriptPage() {
  const ctx = await requireTenant()
  if (!ctx.platformAdmin || !ctx.isDemo) redirect('/')
  const skin = await readDemoSkin(ctx)

  return (
    <div
      style={
        skin?.brandColor
          ? ({ '--demo-accent': skin.brandColor } as React.CSSProperties)
          : undefined
      }
    >
      <ScriptRemote skin={skin} />
    </div>
  )
}

import 'server-only'
import { cookies } from 'next/headers'
import { DEMO_SKIN_COOKIE, type DemoSkin } from '@/lib/types/demo-skin'

/**
 * Read the presenter-mode demo skin. Guarded twice: the cookie only ever
 * matters while the requester is BOTH a platform admin AND inside demo
 * mode — any other combination returns null, so a stale skin cookie can
 * never brand a real clinic's dashboard. Defensive parse (a malformed
 * cookie is null, never a throw).
 */
export async function readDemoSkin(ctx: {
  isDemo: boolean
  platformAdmin: boolean
}): Promise<DemoSkin | null> {
  if (!ctx.isDemo || !ctx.platformAdmin) return null
  try {
    const store = await cookies()
    const raw = store.get(DEMO_SKIN_COOKIE)?.value
    if (!raw) return null
    return parseDemoSkin(raw)
  } catch {
    return null
  }
}

/** Pure parser (exported for tests): junk in → null out. */
export function parseDemoSkin(raw: string): DemoSkin | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.prospectId !== 'string' || !parsed.prospectId) return null
    if (typeof parsed.clinicName !== 'string' || !parsed.clinicName.trim()) return null
    const skin: DemoSkin = {
      prospectId: parsed.prospectId,
      clinicName: parsed.clinicName.trim().slice(0, 80),
    }
    if (typeof parsed.brandColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(parsed.brandColor)) {
      skin.brandColor = parsed.brandColor
    }
    if (typeof parsed.city === 'string' && parsed.city.trim()) {
      skin.city = parsed.city.trim().slice(0, 60)
    }
    if (typeof parsed.logoUrl === 'string' && /^https:\/\//.test(parsed.logoUrl)) {
      skin.logoUrl = parsed.logoUrl.slice(0, 500)
    }
    return skin
  } catch {
    return null
  }
}

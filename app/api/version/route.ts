import { NextResponse } from 'next/server'
import { BUILD_ID } from '@/lib/build-id'

// The running server's build id. A long-lived tab compares it with the id
// baked into its own bundle (components/ui/build-watch.tsx) and offers a
// refresh when they differ — before its next server action is refused as
// "from an older or newer deployment". No database, no auth, nothing a
// visitor could learn beyond "the app was rebuilt".
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({ build: BUILD_ID }, { headers: { 'Cache-Control': 'no-store' } })
}

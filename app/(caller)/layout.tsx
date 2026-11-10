import { requireCaller } from '@/lib/auth/context'
import { DreamCreateLogo } from '@/components/brand/dream-create-logo'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'
import { ToastProvider } from '@/components/ui/toast'
import CallerSignOut from './calls/sign-out'

// Reads the session every request; never prerender.
export const dynamic = 'force-dynamic'

/**
 * The cold-caller portal chrome (P-02) — deliberately minimal: the Dream
 * Create mark, the caller's name, "Dream Create — calling", sign out. NO
 * sidebar, NO dashboard shell, NO link to any clinic, platform or patient
 * surface: a caller's whole world is the queue under this header.
 *
 * The /caller/accept page lives OUTSIDE this gate (its own segment, no
 * session yet — a brand-new caller creates their account there).
 *
 * Authorizes via {@link requireCaller} — a direct prospect_caller.user_id
 * lookup, never `tenantType`. `allowInactive` so a paused / archived caller
 * still resolves and the page renders the right calm state.
 */
export default async function CallerLayout({ children }: { children: React.ReactNode }) {
  const { caller } = await requireCaller({ allowInactive: true })

  return (
    <div className="v2-app min-h-screen bg-[color:var(--color-canvas)] text-gray-900 dark:text-gray-100">
      <ToastProvider>
        <ConfirmProvider>
          <header className="aura-chrome border-b border-gray-200/70 dark:border-gray-700/60">
            <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
              <div className="flex items-center gap-3">
                <DreamCreateLogo size={26} />
                <span className="hidden text-sm text-gray-500 dark:text-gray-400 sm:inline">— calling</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="hidden text-sm text-gray-600 dark:text-gray-400 sm:inline">{caller.name}</span>
                <CallerSignOut />
              </div>
            </div>
          </header>
          <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">{children}</main>
          <footer className="mx-auto max-w-5xl px-4 py-8 text-center text-xs text-gray-500 dark:text-gray-400 sm:px-6">
            Calling for Dream Create
          </footer>
        </ConfirmProvider>
      </ToastProvider>
    </div>
  )
}

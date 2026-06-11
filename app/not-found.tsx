import Link from 'next/link'
import Logo from '@/components/ui/logo'

export const metadata = {
  title: 'Page not found - DreamCRM',
}

// Chrome-less centered 404. The old version rendered the stale Mosaic
// <Sidebar/> + <Header/> — wrong for a clinic tenant (it isn't their nav)
// and broken on routes outside the authenticated shell. A page that doesn't
// exist shouldn't borrow another surface's chrome; this stands alone.
export default function NotFound() {
  return (
    <main className="min-h-[100dvh] flex flex-col items-center justify-center bg-white dark:bg-gray-900 px-4 text-center">
      <div className="mb-6">
        <Logo />
      </div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-400">
        404
      </p>
      <h1 className="mt-2 text-2xl font-bold text-gray-800 dark:text-gray-100">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-gray-500 dark:text-gray-400">
        The page you&rsquo;re looking for doesn&rsquo;t exist or may have moved.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex items-center justify-center rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
      >
        Back to home
      </Link>
    </main>
  )
}

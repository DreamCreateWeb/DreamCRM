import './css/style.css'

import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import Theme from './theme-provider'
import AppProvider from './app-provider'
import ChunkReloadGuard from '@/components/chunk-reload-guard'

export const metadata = {
  // Absolute base for OG/twitter image URLs (Next falls back to localhost
  // without it on non-Vercel hosts — verified broken in prod before this).
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.dreamcreatestudio.com'),
  title: 'DreamCRM',
  description: 'DreamCRM Admin Dashboard',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Geist font variables are declared globally on <html> (just CSS custom
  // properties — harmless everywhere); only the `.v2-app` dashboard/auth/
  // onboarding shells actually CONSUME them, so the public site / portal /
  // marketing keep Inter/Fraunces.
  return (
    // suppressHydrationWarning: https://github.com/vercel/next.js/issues/44343
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body className="font-inter antialiased bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400">
        {/* Text-size preference — applied BEFORE paint (same trick next-themes
            uses for dark mode) so a larger-text user never sees a small-text
            flash. Per device by design: vision needs follow the person's
            screen, not their account. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var s=localStorage.getItem('dc-text-size');if(s==='lg'||s==='xl')document.documentElement.classList.add('dc-text-'+s)}catch(e){}})();",
          }}
        />
        {/* Auto-recovers from stale-chunk 404s after a deploy (one guarded
            reload) so a subscriber never hits the fatal client-side error. */}
        <ChunkReloadGuard />
        <Theme>
          <AppProvider>
            {children}
          </AppProvider>
        </Theme>
      </body>
    </html>
  )
}

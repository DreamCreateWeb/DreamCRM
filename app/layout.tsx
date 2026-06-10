import './css/style.css'

import Theme from './theme-provider'
import AppProvider from './app-provider'

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
  return (
    <html lang="en" suppressHydrationWarning>{/* suppressHydrationWarning: https://github.com/vercel/next.js/issues/44343 */}
      <body className="font-inter antialiased bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400">
        <Theme>
          <AppProvider>
            {children}
          </AppProvider>
        </Theme>
      </body>
    </html>
  )
}

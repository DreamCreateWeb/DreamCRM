import './css/style.css'

import Theme from './theme-provider'
import AppProvider from './app-provider'

export const metadata = {
  title: 'Dream Create',
  description: 'Infrastructure for modern dental clinics — HIPAA-aligned, built for Arkansas practices.',
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

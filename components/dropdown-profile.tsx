'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react'
import UserAvatar from '@/public/images/user-avatar-32.png'
import { useSession, signOut } from '@/lib/auth-client'

export default function DropdownProfile({
  align,
  collapsed = false,
}: {
  align?: 'left' | 'right'
  /** Rail mode: render the avatar only (no name/chevron) so the 64px sidebar
      doesn't overflow horizontally. Hidden at lg+ only — the mobile drawer
      (full width) still shows the name. */
  collapsed?: boolean
}) {
  const { data: session } = useSession()
  const user = session?.user

  const displayName =
    (user as any)?.companyName?.toString().trim() ||
    user?.name ||
    user?.email ||
    'Account'
  const role = (user as any)?.role ?? 'Member'
  const avatar = user?.image || UserAvatar

  async function handleSignOut() {
    await signOut()
    // Full reload so the cleared session cookie is reflected on the next
    // request — avoids middleware seeing the stale cookie and bouncing.
    window.location.assign('/signin')
  }

  return (
    <Menu as="div" className="relative inline-flex min-w-0">
      <MenuButton className="inline-flex min-w-0 justify-center items-center group">
        <Image
          className="w-8 h-8 rounded-full shrink-0"
          src={avatar as any}
          width={32}
          height={32}
          alt={displayName}
          unoptimized={typeof avatar === 'string'}
        />
        {/* Name + chevron — hidden in the rail (lg+) so the avatar stands alone. */}
        <div className={`flex min-w-0 items-center ${collapsed ? 'lg:hidden' : ''}`}>
          <span className="truncate ml-2 text-sm font-medium text-gray-600 dark:text-gray-100 group-hover:text-gray-800 dark:group-hover:text-white">
            {displayName}
          </span>
          <svg className="w-3 h-3 shrink-0 ml-1 fill-current text-gray-400 dark:text-gray-500" viewBox="0 0 12 12">
            <path d="M5.9 11.4L.5 6l1.4-1.4 4 4 4-4L11.3 6z" />
          </svg>
        </div>
      </MenuButton>
      {/* `anchor` floats the menu in a portal (escapes the sidebar's
          overflow-hidden clip) and positions it relative to the button:
          opens UP from the bottom-left profile slot, DOWN from a top-right
          header. `transition` drives the CSS data-state animation. */}
      <MenuItems
        anchor={{ to: align === 'right' ? 'bottom end' : 'top start', gap: 8 }}
        transition
        className="z-50 min-w-[12rem] origin-top rounded-lg border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800 py-1.5 shadow-lg overflow-hidden transition duration-150 ease-out data-[closed]:opacity-0 data-[closed]:-translate-y-1 focus:outline-hidden"
      >
        <div className="pt-0.5 pb-2 px-3 mb-1 border-b border-gray-200 dark:border-gray-700/60">
          <div className="font-medium text-gray-800 dark:text-gray-100 truncate">{displayName}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 italic capitalize">{role}</div>
        </div>
        <MenuItem>
          <Link
            className="font-medium text-sm flex items-center py-1.5 px-3 text-teal-700 dark:text-teal-400 data-[focus]:bg-teal-500/10"
            href="/settings/account"
          >
            Account settings
          </Link>
        </MenuItem>
        <MenuItem>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full text-left font-medium text-sm flex items-center py-1.5 px-3 text-teal-700 dark:text-teal-400 data-[focus]:bg-teal-500/10"
          >
            Sign Out
          </button>
        </MenuItem>
      </MenuItems>
    </Menu>
  )
}

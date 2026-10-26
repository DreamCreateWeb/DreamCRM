'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'

/**
 * The header's sun/moon — a real `role="switch"`, not the Mosaic checkbox.
 *
 * The template's hidden `<input type="checkbox">` flipped
 * `theme === 'dark' ? 'light' : 'dark'` off the STORED choice. next-themes
 * starts at 'system', so on a dark device the first click set 'dark' — the
 * screen did not change and a second click was needed — and
 * `checked={theme === 'light'}` announced the opposite of what was painted.
 *
 * This reads `resolvedTheme` (what is actually on screen) for both the
 * announced state and the flip, so the first click always changes the
 * screen. It only ever sets an explicit 'light' or 'dark' — a two-state
 * control has no third position — and Settings → Account's ThemeChoice is
 * the door back to "Match device". The icons keep the CSS swap
 * (`dark:hidden` / `hidden dark:block`) rather than keying off
 * `resolvedTheme`: the `.dark` class is set by next-themes' pre-paint script,
 * so the CSS answer is right from the first frame, while `resolvedTheme` is
 * undefined until the component mounts (the `mounted` guard keeps SSR and
 * hydration in agreement on `aria-checked`).
 *
 * 40px box per DESIGN-SYSTEM §2.2 (the template shipped `w-8 h-8`).
 */
export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isDark = mounted && resolvedTheme === 'dark'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="Dark mode"
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100 lg:hover:bg-gray-200 dark:hover:bg-gray-700/50 dark:lg:hover:bg-gray-800"
    >
      <svg
        className="dark:hidden fill-current text-gray-500/80 dark:text-gray-400/80"
        width={16}
        height={16}
        viewBox="0 0 16 16"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path d="M8 0a1 1 0 0 1 1 1v.5a1 1 0 1 1-2 0V1a1 1 0 0 1 1-1Z" />
        <path d="M12 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm-4 2a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
        <path d="M13.657 3.757a1 1 0 0 0-1.414-1.414l-.354.354a1 1 0 0 0 1.414 1.414l.354-.354ZM13.5 8a1 1 0 0 1 1-1h.5a1 1 0 1 1 0 2h-.5a1 1 0 0 1-1-1ZM13.303 11.889a1 1 0 0 0-1.414 1.414l.354.354a1 1 0 0 0 1.414-1.414l-.354-.354ZM8 13.5a1 1 0 0 1 1 1v.5a1 1 0 1 1-2 0v-.5a1 1 0 0 1 1-1ZM4.111 13.303a1 1 0 1 0-1.414-1.414l-.354.354a1 1 0 1 0 1.414 1.414l.354-.354ZM0 8a1 1 0 0 1 1-1h.5a1 1 0 0 1 0 2H1a1 1 0 0 1-1-1ZM3.757 2.343a1 1 0 1 0-1.414 1.414l.354.354A1 1 0 1 0 4.11 2.697l-.354-.354Z" />
      </svg>
      <svg
        className="hidden dark:block fill-current text-gray-500/80 dark:text-gray-400/80"
        width={16}
        height={16}
        viewBox="0 0 16 16"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path d="M11.875 4.375a.625.625 0 1 0 1.25 0c.001-.69.56-1.249 1.25-1.25a.625.625 0 1 0 0-1.25 1.252 1.252 0 0 1-1.25-1.25.625.625 0 1 0-1.25 0 1.252 1.252 0 0 1-1.25 1.25.625.625 0 1 0 0 1.25c.69.001 1.249.56 1.25 1.25Z" />
        <path d="M7.019 1.985a1.55 1.55 0 0 0-.483-1.36 1.44 1.44 0 0 0-1.53-.277C2.056 1.553 0 4.5 0 7.9 0 12.352 3.648 16 8.1 16c3.407 0 6.246-2.058 7.51-4.963a1.446 1.446 0 0 0-.25-1.55 1.554 1.554 0 0 0-1.372-.502c-4.01.552-7.539-2.987-6.97-7ZM2 7.9C2 5.64 3.193 3.664 4.961 2.6 4.82 7.245 8.72 11.158 13.36 11.04 12.265 12.822 10.341 14 8.1 14 4.752 14 2 11.248 2 7.9Z" />
      </svg>
    </button>
  )
}

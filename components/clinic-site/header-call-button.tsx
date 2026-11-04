import { SITE_INK } from '@/components/clinic-site/tokens'

/**
 * The header's tappable phone — an icon button that is visible at EVERY
 * width. Each template's header keeps its own wide-screen text link (the
 * number spelled out) and renders this with `hideFrom` set to the breakpoint
 * where that text link takes over, so a patient on a phone always has the
 * number one tap away. 44px target (the site tap floor).
 *
 * `hideFrom` is spelled out per breakpoint so Tailwind sees the class names.
 */
const HIDE_FROM = {
  md: 'md:hidden',
  lg: 'lg:hidden',
  xl: 'xl:hidden',
  '2xl': '2xl:hidden',
  never: '',
} as const

export default function HeaderCallButton({
  phone,
  name,
  hideFrom = 'never',
}: {
  phone: string
  name: string
  hideFrom?: keyof typeof HIDE_FROM
}) {
  return (
    <a
      href={`tel:${phone}`}
      aria-label={`Call ${name}`}
      data-header-call
      className={`inline-flex items-center justify-center w-11 h-11 shrink-0 rounded-full ${HIDE_FROM[hideFrom]}`}
      style={{ color: SITE_INK }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"
        />
      </svg>
    </a>
  )
}

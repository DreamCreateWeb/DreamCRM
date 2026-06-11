import Link from 'next/link'
import { DreamCreateMark } from '@/components/brand/dream-create-logo'

/**
 * The app-chrome logo slot. Every layout/header imports this component, so
 * the brand swaps in one place — it now renders the Dream Create liquid-D
 * mark (see components/brand/dream-create-logo.tsx for the lockup + tokens).
 */
export default function Logo() {
  return (
    <Link className="block" href="/" aria-label="Dream Create — home">
      <DreamCreateMark size={32} />
    </Link>
  )
}

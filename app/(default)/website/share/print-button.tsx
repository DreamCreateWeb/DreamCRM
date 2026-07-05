'use client'

import { ActionButton } from '@/components/ui/action-button'

/** The page's single primary action — hands the cards to the printer. */
export default function PrintCardsButton() {
  return (
    <ActionButton variant="primary" size="sm" onClick={() => window.print()} breath>
      🖨 Print cards
    </ActionButton>
  )
}

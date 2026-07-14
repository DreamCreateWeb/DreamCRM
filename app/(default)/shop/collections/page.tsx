import { permanentRedirect } from 'next/navigation'

/** Money management moved out of Shop into the Payments workspace
 *  (structure redesign, 2026-07-14). 308 so old bookmarks + emailed links
 *  carry over permanently. */
export default function ShopMoneyRedirect() {
  permanentRedirect('/payments/collections')
}

'use client'

import DeleteButton from '@/components/delete-button'
import { removeOrders } from './actions'

export default function DeleteOrdersButton() {
  return <DeleteButton onDelete={async (ids) => { await removeOrders(ids) }} />
}

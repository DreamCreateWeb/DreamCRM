'use client'

import DeleteButton from '@/components/delete-button'
import { removeCustomers } from './actions'

export default function DeleteCustomersButton() {
  return <DeleteButton onDelete={async (ids) => { await removeCustomers(ids) }} />
}

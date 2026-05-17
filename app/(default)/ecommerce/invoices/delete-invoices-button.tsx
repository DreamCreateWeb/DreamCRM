'use client'

import DeleteButton from '@/components/delete-button'
import { removeInvoices } from './actions'

export default function DeleteInvoicesButton() {
  return <DeleteButton onDelete={async (ids) => { await removeInvoices(ids) }} />
}

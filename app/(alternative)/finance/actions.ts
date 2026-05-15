'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/session'
import {
  CardInput,
  TransactionInput,
  AccountInput,
  createCard,
  createTransaction,
  createAccount,
  deleteCard,
} from '@/lib/services/fintech'

export async function addCard(input: unknown) {
  const user = await requireUser()
  const data = CardInput.parse(input)
  const card = await createCard(user.id, data)
  revalidatePath('/finance/cards')
  revalidatePath('/dashboard/fintech')
  return card
}

export async function addTransaction(input: unknown) {
  const user = await requireUser()
  const data = TransactionInput.parse(input)
  const tx = await createTransaction(user.id, data)
  revalidatePath('/finance/transactions')
  revalidatePath('/dashboard/fintech')
  return tx
}

export async function addAccount(input: unknown) {
  const user = await requireUser()
  const data = AccountInput.parse(input)
  const acct = await createAccount(user.id, data)
  revalidatePath('/dashboard/fintech')
  return acct
}

export async function removeCard(id: number) {
  const user = await requireUser()
  const result = await deleteCard(user.id, id)
  revalidatePath('/finance/cards')
  return result
}

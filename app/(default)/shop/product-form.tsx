'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  CATEGORY_LABELS,
  FULFILLMENT_LABELS,
  type ProductRow,
  type ProductCategory,
  type Fulfillment,
  type ProductStatus,
  type VariantInput,
} from '@/lib/types/shop'
import { saveProductAction } from './actions'

const FIELD = 'w-full text-sm px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800'
const LABEL = 'block text-[12px] font-medium text-stone-700 dark:text-stone-200 mb-1'

type VariantState = VariantInput & { key: string }

function emptyVariant(): VariantState {
  return { key: Math.random().toString(36).slice(2), name: '', sku: '', priceDollars: 0, inventoryQty: null }
}

export default function ProductForm({ product }: { product?: ProductRow }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(product?.name ?? '')
  const [category, setCategory] = useState<ProductCategory>(product?.category ?? 'whitening')
  const [description, setDescription] = useState(product?.description ?? '')
  const [fulfillment, setFulfillment] = useState<Fulfillment>(product?.fulfillment ?? 'both')
  const [status, setStatus] = useState<ProductStatus>(product?.status ?? 'draft')
  const [fsaEligible, setFsaEligible] = useState(product?.fsaEligible ?? false)
  const [featured, setFeatured] = useState(product?.featured ?? false)
  const [images, setImages] = useState<string[]>(product?.images ?? [])
  const [uploading, setUploading] = useState(false)
  const [variants, setVariants] = useState<VariantState[]>(
    product && product.variants.length > 0
      ? product.variants.map((v) => ({
          key: v.id,
          id: v.id,
          name: v.name,
          sku: v.sku ?? '',
          priceDollars: v.priceCents / 100,
          compareAtDollars: v.compareAtCents != null ? v.compareAtCents / 100 : null,
          inventoryQty: v.inventoryQty,
        }))
      : [{ ...emptyVariant(), name: 'Default' }],
  )

  async function onUpload(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('folder', 'shop')
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) throw new Error('Upload failed')
      const { url } = (await res.json()) as { url: string }
      setImages((imgs) => [...imgs, url])
    } catch {
      setError('Image upload failed — try again.')
    } finally {
      setUploading(false)
    }
  }

  function updateVariant(key: string, patch: Partial<VariantState>) {
    setVariants((vs) => vs.map((v) => (v.key === key ? { ...v, ...patch } : v)))
  }

  function submit() {
    setError(null)
    if (!name.trim()) return setError('Product name is required')
    startTransition(async () => {
      try {
        await saveProductAction({
          id: product?.id,
          name,
          category,
          description: description || null,
          images,
          fulfillment,
          status,
          fsaEligible,
          featured,
          variants: variants.map((v) => ({
            id: v.id,
            name: v.name,
            sku: v.sku || null,
            priceDollars: Number(v.priceDollars) || 0,
            compareAtDollars: v.compareAtDollars != null ? Number(v.compareAtDollars) : null,
            inventoryQty: v.inventoryQty === null || v.inventoryQty === undefined ? null : Number(v.inventoryQty),
          })),
        })
        router.push('/shop')
        router.refresh()
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-3xl mx-auto">
      <div className="mb-5">
        <Link href="/shop" className="text-[12px] text-stone-500 dark:text-stone-400 hover:underline">← Back to Shop</Link>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100 tracking-tight mt-1">{product ? 'Edit product' : 'New product'}</h1>
      </div>

      <div className="space-y-5">
        <div>
          <label className={LABEL}>Name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Professional Whitening Kit" className={FIELD} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value as ProductCategory)} className={FIELD}>
              {Object.entries(CATEGORY_LABELS).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Fulfillment</label>
            <select value={fulfillment} onChange={(e) => setFulfillment(e.target.value as Fulfillment)} className={FIELD}>
              {Object.entries(FULFILLMENT_LABELS).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
            </select>
          </div>
        </div>

        <div>
          <label className={LABEL}>Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={`${FIELD} resize-y`} />
        </div>

        {/* Images */}
        <div>
          <label className={LABEL}>Photos</label>
          <div className="flex flex-wrap gap-2 items-center">
            {images.map((url, i) => (
              <div key={url} className="relative w-20 h-20 rounded-lg overflow-hidden border border-stone-200 dark:border-stone-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="w-full h-full object-cover" />
                <button onClick={() => setImages((imgs) => imgs.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white text-xs leading-none">×</button>
              </div>
            ))}
            <label className="w-20 h-20 rounded-lg border border-dashed border-stone-300 dark:border-stone-600 flex items-center justify-center text-[11px] text-stone-400 cursor-pointer hover:border-violet-400">
              {uploading ? '…' : '+ Photo'}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f) }} />
            </label>
          </div>
        </div>

        {/* Variants */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className={LABEL + ' mb-0'}>Variants &amp; pricing</label>
            <button onClick={() => setVariants((vs) => [...vs, emptyVariant()])} className="text-[12px] font-medium text-violet-600 dark:text-violet-400">+ Add variant</button>
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_5rem_5rem_4rem_1.5rem] gap-2 text-[10px] uppercase tracking-wider text-stone-400 px-1">
              <span>Variant</span><span>Price $</span><span>Compare $</span><span>Stock</span><span></span>
            </div>
            {variants.map((v) => (
              <div key={v.key} className="grid grid-cols-[1fr_5rem_5rem_4rem_1.5rem] gap-2 items-center">
                <input value={v.name} onChange={(e) => updateVariant(v.key, { name: e.target.value })} placeholder="e.g. Mint / Level 2" className={FIELD} />
                <input type="number" step="0.01" value={v.priceDollars} onChange={(e) => updateVariant(v.key, { priceDollars: parseFloat(e.target.value) })} className={FIELD} />
                <input type="number" step="0.01" value={v.compareAtDollars ?? ''} onChange={(e) => updateVariant(v.key, { compareAtDollars: e.target.value ? parseFloat(e.target.value) : null })} className={FIELD} />
                <input type="number" value={v.inventoryQty ?? ''} placeholder="∞" onChange={(e) => updateVariant(v.key, { inventoryQty: e.target.value ? parseInt(e.target.value) : null })} className={FIELD} />
                <button onClick={() => setVariants((vs) => (vs.length > 1 ? vs.filter((x) => x.key !== v.key) : vs))} className="text-stone-400 hover:text-rose-600 text-sm">×</button>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-stone-400 mt-1.5">Leave Stock blank for unlimited (untracked) inventory.</p>
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-[13px] text-stone-600 dark:text-stone-300">
            <input type="checkbox" checked={fsaEligible} onChange={(e) => setFsaEligible(e.target.checked)} className="rounded" /> FSA/HSA-eligible (with Rx)
          </label>
          <label className="flex items-center gap-2 text-[13px] text-stone-600 dark:text-stone-300">
            <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} className="rounded" /> Featured
          </label>
        </div>

        <div>
          <label className={LABEL}>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as ProductStatus)} className={FIELD}>
            <option value="draft">Draft (hidden)</option>
            <option value="active">Active (live on storefront)</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        {error && <p className="text-[13px] text-rose-600">{error}</p>}

        <div className="flex items-center gap-3 pt-2">
          <button disabled={isPending || uploading} onClick={submit} className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-60 dark:bg-stone-100 dark:text-stone-900">
            {isPending ? 'Saving…' : product ? 'Save changes' : 'Create product'}
          </button>
          <Link href="/shop" className="text-[13px] text-stone-500 dark:text-stone-400 hover:underline">Cancel</Link>
        </div>
      </div>
    </div>
  )
}

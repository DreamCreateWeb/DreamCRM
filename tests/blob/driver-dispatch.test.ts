import { describe, it, expect, vi, beforeEach } from 'vitest'

const vercelResult = {
  url: 'https://vercel.blob/x',
  downloadUrl: 'https://vercel.blob/x',
  pathname: 'x',
  contentType: '',
  contentDisposition: '',
}

// vi.mock is hoisted above const declarations, so the mock fns must come from
// vi.hoisted to exist when the factory runs.
const mocks = vi.hoisted(() => ({
  put: vi.fn(),
  del: vi.fn(),
  list: vi.fn(),
  uploadToS3: vi.fn(),
  deleteFromS3: vi.fn(),
  listFromS3: vi.fn(),
}))

vi.mock('@vercel/blob', () => ({ put: mocks.put, del: mocks.del, list: mocks.list }))
vi.mock('@/lib/blob-s3', () => ({
  uploadToS3: mocks.uploadToS3,
  deleteFromS3: mocks.deleteFromS3,
  listFromS3: mocks.listFromS3,
}))

import { uploadBlob, deleteBlob, listBlobs } from '@/lib/blob'

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset())
  mocks.put.mockResolvedValue(vercelResult)
  mocks.del.mockResolvedValue(undefined)
  mocks.list.mockResolvedValue({ blobs: [] })
  mocks.uploadToS3.mockResolvedValue({ ...vercelResult, url: 'https://s3/x' })
  mocks.deleteFromS3.mockResolvedValue(undefined)
  mocks.listFromS3.mockResolvedValue({ blobs: [] })
  delete process.env.STORAGE_DRIVER
})

describe('storage driver dispatch', () => {
  it('defaults to Vercel Blob when STORAGE_DRIVER is unset', async () => {
    await uploadBlob('p', 'body')
    await deleteBlob('https://vercel.blob/x')
    await listBlobs('p')
    expect(mocks.put).toHaveBeenCalledOnce()
    expect(mocks.del).toHaveBeenCalledOnce()
    expect(mocks.list).toHaveBeenCalledOnce()
    expect(mocks.uploadToS3).not.toHaveBeenCalled()
  })

  it('passes access:public + addRandomSuffix to the Vercel put', async () => {
    await uploadBlob('p', 'body', { contentType: 'image/png' })
    expect(mocks.put).toHaveBeenCalledWith(
      'p',
      'body',
      expect.objectContaining({
        access: 'public',
        addRandomSuffix: true,
        contentType: 'image/png',
      })
    )
  })

  it('routes to S3 when STORAGE_DRIVER=s3', async () => {
    process.env.STORAGE_DRIVER = 's3'
    await uploadBlob('p', 'body')
    await deleteBlob('https://s3/x')
    await listBlobs('p')
    expect(mocks.uploadToS3).toHaveBeenCalledOnce()
    expect(mocks.deleteFromS3).toHaveBeenCalledOnce()
    expect(mocks.listFromS3).toHaveBeenCalledOnce()
    expect(mocks.put).not.toHaveBeenCalled()
  })
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone server output so the container image (App Runner) ships a
  // minimal self-contained server.js.
  output: 'standalone',

  // Allow Next/Image to optimize images served from:
  //   - Vercel Blob (avatars, product images, clinic logos uploaded via /api/upload)
  //   - The wildcard clinic domains (clinic-uploaded brand assets)
  //   - The S3 uploads bucket (once STORAGE_DRIVER=s3)
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.public.blob.vercel-storage.com' },
      { protocol: 'https', hostname: '**.dreamcreatestudio.com' },
      { protocol: 'https', hostname: 'dreamcrm-uploads-prod.s3.us-east-1.amazonaws.com' },
    ],
  },

  // The migration SQL file is read at runtime by any bootstrap-style admin
  // route. Make sure Next traces it into the deployment bundle.
  outputFileTracingIncludes: {
    '/api/admin/**': ['./lib/db/migrations/**'],
  },

  poweredByHeader: false,

  experimental: {
    // Larger Server Action payload limit — matches the 10 MB cap in /api/upload.
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
}

module.exports = nextConfig

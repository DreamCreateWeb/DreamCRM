// One id per build, shared by the server bundle and every client bundle (see
// lib/build-id.ts). A commit sha when the pipeline hands one in, otherwise a
// timestamp — it only has to DIFFER from build to build. `env` values are
// inlined at build time, which is exactly the property we need: a tab keeps
// the id of the build it loaded, the server reports the one it runs.
const BUILD_ID =
  process.env.NEXT_PUBLIC_BUILD_ID ||
  (process.env.CODEBUILD_RESOLVED_SOURCE_VERSION || process.env.GITHUB_SHA || '').slice(0, 12) ||
  Date.now().toString(36)

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID },

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

  // Security headers. On Vercel these came from vercel.json; App Runner does
  // not read that file, so they must live here to actually be served. Move to
  // a CloudFront response-headers policy if/when a CDN fronts the app.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
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

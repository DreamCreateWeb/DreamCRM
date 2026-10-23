/**
 * The id of the build this code came from — ONE value shared by the server
 * bundle and every client bundle of the same `next build`, inlined at build
 * time through `env.NEXT_PUBLIC_BUILD_ID` in next.config.js (a commit sha when
 * the pipeline knows one, otherwise a timestamp — it only has to DIFFER from
 * build to build).
 *
 * Why it exists: a browser tab keeps running the bundle it loaded, while every
 * merge to `main` deploys a new server. A server action is addressed by an id
 * that changes per build, so the stale tab's next save is refused ("Failed to
 * find Server Action … older or newer deployment") and, unhandled, that looked
 * like the Website Studio freezing. Comparing a tab's BUILD_ID with the
 * server's (`/api/version`, the canvas's `ready` ping) turns that into a
 * "refresh to keep working" prompt BEFORE the next save fails.
 */
export const BUILD_ID: string = process.env.NEXT_PUBLIC_BUILD_ID || 'dev'

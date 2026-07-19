/**
 * Shared `NEXT_PUBLIC_APP_URL` reader (Appendix B). Several route/page files ad hoc-duplicate a
 * local `appUrl()` (`app/p/[slug]/page.tsx`, `app/api/v1/wallet/nonce/route.ts`, etc.) — this
 * factors it out for the WS8-T4 oEmbed endpoint and sitemap, both of which need the exact same
 * "canonical origin" value and share it with each other (`apps/web/lib/oembed/*`,
 * `apps/web/lib/sitemap.ts`). Existing call sites are left untouched — refactoring them is out
 * of this task's scope (§0.2: work only your task).
 */
export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

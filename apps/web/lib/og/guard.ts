/**
 * The §10.5 `?v=` abuse guard, shared by every `/api/og/*` and `/api/cards/*` template route:
 * the server recomputes the canonical state hash from the current entity; a request whose `?v=`
 * doesn't match (including a missing `?v=`) is 302-redirected to the canonical URL and the
 * image is never rendered. This is what stops `?v=<garbage>` cache-busting from forcing
 * unbounded cold satori renders — a mismatched request costs one cheap DB read + a redirect,
 * never a render.
 */
import { NextResponse } from 'next/server';

/**
 * Returns a 302 redirect to the canonical `?v=` URL when `request`'s `v` param doesn't match
 * `canonicalHash`, or `null` when the caller should proceed to render (exact match). Every
 * other query param on the incoming request (e.g. `/api/cards/*`'s `?format=`, WS8-T2) is
 * preserved on the redirect target — only `v` itself is replaced — so a card request missing
 * (or holding a stale) `?v=` still lands on the SAME format after the redirect, rather than
 * silently reverting to whatever the route defaults to.
 */
export function ogVersionGuard(request: Request, canonicalHash: string): NextResponse | null {
  const url = new URL(request.url);
  if (url.searchParams.get('v') === canonicalHash) return null;

  const canonical = new URL(url.pathname, url.origin);
  url.searchParams.forEach((value, key) => {
    if (key !== 'v') canonical.searchParams.set(key, value);
  });
  canonical.searchParams.set('v', canonicalHash);
  return NextResponse.redirect(canonical, 302);
}

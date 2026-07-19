/**
 * Same-host pattern-match parser for `GET /api/oembed?url=` (design doc §10.5, §19.3 WS8-T4):
 * "The `url` parameter is parsed and pattern-matched only — it must be same-host and match a
 * known public route pattern (`/q/*`, `/p/*`, `/vs/*`, `/duos/*`) or the request is 404'd; the
 * server never fetches the supplied URL (no SSRF surface)."
 *
 * SECURITY: this module MUST NEVER call `fetch`/`http.request`/DNS resolution/etc. on `rawUrl`
 * or anything derived from it. Its only job is string parsing: decide whether `rawUrl` *looks
 * like* one of this app's own public page URLs, on this app's own configured host. A foreign
 * host, an internal/private-IP-shaped host, a non-`https:` absolute scheme, path traversal, or
 * a path that simply isn't one of the known route shapes are all indistinguishable from "not
 * one of ours" here — every one of them returns `null`, which the route handler turns into a
 * plain 404. There is no allowlist of "safe" foreign hosts to bypass; the only accepted host is
 * this app's own.
 */

export type OembedEntityKind = 'question' | 'profile' | 'matchup' | 'duo';

export interface OembedRouteMatch {
  kind: OembedEntityKind;
  /** The single path segment identifying the entity: a slug (question/profile) or a uuid-shaped
   * id (matchup/duo). Not yet checked against the database — callers still need a 404 for a
   * syntactically-valid but nonexistent id. */
  id: string;
}

interface RoutePattern {
  kind: OembedEntityKind;
  // Exactly one non-slash segment after the prefix, optional trailing slash. `[^/]+` cannot
  // itself match a literal `/`, which is most of the traversal defense; the decode-then-check
  // below (`assertSafeSegment`) covers the percent-encoded case (`%2f` etc.).
  regex: RegExp;
}

const ROUTE_PATTERNS: readonly RoutePattern[] = [
  { kind: 'question', regex: /^\/q\/([^/]+)\/?$/ },
  { kind: 'profile', regex: /^\/p\/([^/]+)\/?$/ },
  { kind: 'matchup', regex: /^\/vs\/([^/]+)\/?$/ },
  { kind: 'duo', regex: /^\/duos\/([^/]+)\/?$/ },
];

/**
 * Returns the pathname portion of `rawUrl` iff it resolves unambiguously to `appOrigin`'s own
 * host, or `null` for anything else. Two shapes are accepted, both of which carry no way to
 * point at a different host:
 *
 *  - a path starting with a single `/` (what `/q/[slug]/page.tsx`'s discovery link emits
 *    today) — implicitly same-host, since it carries no scheme/authority at all. A
 *    scheme-relative `//host/...` value is explicitly rejected here even though it also starts
 *    with `/` — it carries its own (possibly foreign) authority and must not be treated as a
 *    bare path.
 *  - a fully-qualified `https://` URL whose host exactly matches `appOrigin`'s host (what
 *    `/p/[slug]/page.tsx`'s discovery link emits, and the conventional oEmbed `url=` shape) —
 *    `http://` and every other scheme are rejected outright, regardless of host.
 */
function extractSameHostPath(rawUrl: string, appOrigin: string): string | null {
  if (rawUrl.startsWith('/')) {
    if (rawUrl.startsWith('//')) return null;
    const path = rawUrl.split(/[?#]/, 1)[0];
    return path && path.length > 0 ? path : null;
  }

  let origin: URL;
  try {
    origin = new URL(appOrigin);
  } catch {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:') return null;
  if (parsed.host !== origin.host) return null;
  return parsed.pathname;
}

/** `false` for anything that can't legitimately be a slug/id path segment: empty, `.`/`..`, or
 * (after decoding) still containing a `/` — the percent-encoded traversal case (`%2e%2e%2f`
 * etc.), since `[^/]+` only blocks a *literal* slash in the still-encoded pathname. */
function isSafeSegment(segment: string): boolean {
  return segment.length > 0 && segment !== '.' && segment !== '..' && !segment.includes('/');
}

export function matchOembedUrl(rawUrl: string | null | undefined, appOrigin: string): OembedRouteMatch | null {
  if (!rawUrl) return null;

  const pathname = extractSameHostPath(rawUrl, appOrigin);
  if (pathname === null) return null;

  for (const { kind, regex } of ROUTE_PATTERNS) {
    const match = regex.exec(pathname);
    if (!match) continue;

    let segment: string;
    try {
      segment = decodeURIComponent(match[1]!);
    } catch {
      return null;
    }
    if (!isSafeSegment(segment)) return null;

    return { kind, id: segment };
  }

  return null;
}

/**
 * Client-side helpers for the WS8-T2 share sheet (design doc §10.5). Split out of the
 * `ShareSheet` component so the URL-building logic (pure, easily unit-tested) isn't tangled up
 * with the DOM/Web-API-touching parts (fetch, clipboard, `navigator.share`, anchor-click
 * download — all of which need mocking in a component test rather than a plain unit test).
 */
import type { ShareArtifactKind, ShareCardFormat } from '@receipts/core';

/**
 * `/api/cards/:kind/:id?format=...` (§10.5). No `?v=` is appended — the route's own `?v=`
 * guard 302s a missing/stale hash to the canonical URL (browsers and `fetch` both follow
 * redirects transparently), so the client never needs to know the current content hash.
 */
export function cardImageUrl(kind: ShareArtifactKind, targetId: string, format: ShareCardFormat): string {
  return `/api/cards/${kind}/${encodeURIComponent(targetId)}?format=${format}`;
}

/** Builds the shareable page URL, appending the §10.5 `?r=` attribution token when minted. */
export function buildSharePageUrl(origin: string, pagePath: string, token: string | null): string {
  const url = new URL(pagePath, origin);
  if (token) url.searchParams.set('r', token);
  return url.toString();
}

export class ShareTokenError extends Error {}

/** `POST /api/share/token` — mints the `?r=` attribution token for `artifactKind`. */
export async function mintShareToken(artifactKind: ShareArtifactKind): Promise<string> {
  const res = await fetch('/api/share/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ artifact_kind: artifactKind }),
  });
  if (!res.ok) throw new ShareTokenError(`share token mint failed: ${res.status}`);
  const body = (await res.json()) as { data?: { token?: string } };
  const token = body.data?.token;
  if (!token) throw new ShareTokenError('share token mint returned no token');
  return token;
}

export class CardFetchError extends Error {}

/** Fetches the rendered card PNG at `url` as a `File` (for Web Share / download). */
export async function fetchCardFile(url: string, filename: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new CardFetchError(`card fetch failed: ${res.status}`);
  const blob = await res.blob();
  return new File([blob], filename, { type: 'image/png' });
}

/** Triggers a browser download of `file` via a transient anchor click — no server round trip
 * beyond the fetch that already produced `file`. */
export function triggerFileDownload(file: File): void {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export type WebShareOutcome = 'shared' | 'cancelled' | 'unsupported';

/**
 * Native share (§10.5: "native share (Web Share API w/ file)"). Returns `'unsupported'` without
 * throwing when the browser has no `navigator.share` or can't share files (desktop Safari/
 * Firefox as of this writing) — callers fall back to download/copy-link. `'cancelled'` covers
 * the user dismissing the OS share sheet (`AbortError`), which is not a failure.
 */
export async function shareViaWebShare(
  file: File,
  url: string,
  title: string,
): Promise<WebShareOutcome> {
  const nav = navigator as Navigator & {
    share?: (data: ShareData) => Promise<void>;
    canShare?: (data: ShareData) => boolean;
  };
  if (!nav.share) return 'unsupported';
  const data: ShareData = { files: [file], url, title };
  if (nav.canShare && !nav.canShare(data)) return 'unsupported';

  try {
    await nav.share(data);
    return 'shared';
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    throw err;
  }
}

/** Copy-link fallback (§10.5). */
export async function copyShareLink(url: string): Promise<void> {
  await navigator.clipboard.writeText(url);
}

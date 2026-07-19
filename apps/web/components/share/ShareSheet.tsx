'use client';

/**
 * Dismissible overlay chrome for the §10.5 share sheet (WS8-T2): story/square card preview,
 * native share (Web Share API w/ file), download, copy-link — with the missing-`navigator.share`
 * fallback the AC calls for (§10.5: "The share sheet (client) offers: native share ... download,
 * copy link"). Structurally mirrors `ClaimSheet` (backdrop button + labeled dialog, fully
 * controlled via `open`/`onOpenChange`) rather than inventing new overlay chrome.
 *
 * Fires `share_completed` (§13.1) exactly once per completed action: on a `navigator.share`
 * promise that resolves (not on `AbortError`, i.e. the user backing out of the OS sheet, and
 * not on `'unsupported'`, since neither is a completed share), on a download that fetched
 * successfully, and on a successful clipboard write. `props: {kind, method, format}` — this is
 * the funnel start of §13.1's K-factor chain (`share_completed → spectator_view w/
 * source=share_card → ...`).
 *
 * `pagePath` is the caller's job to supply (see `ViewerStrip`'s `/q/${question.slug}` call
 * site) — this component has no entity-lookup of its own, matching every other §10.5 card/OG
 * route's "receipt has no page of its own, it points at its question" posture
 * (`lib/og/paths.ts`).
 */
import { useEffect, useState } from 'react';
import type { ShareArtifactKind, ShareCardFormat } from '@receipts/core';
import { shareCopy } from '@/lib/copy';
import { postAnalyticsEvent } from '@/lib/analytics-client';
import {
  buildSharePageUrl,
  cardImageUrl,
  copyShareLink,
  fetchCardFile,
  mintShareToken,
  shareViaWebShare,
  triggerFileDownload,
} from '@/lib/share-client';

export interface ShareSheetProps {
  kind: ShareArtifactKind;
  targetId: string;
  /** e.g. `/q/2026-07-18-world-cup-final` — the canonical page this artifact lives on. */
  pagePath: string;
  /** Web Share API dialog title. */
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ShareSheet({ kind, targetId, pagePath, title, open, onOpenChange }: ShareSheetProps) {
  const [format, setFormat] = useState<ShareCardFormat>('square');
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Feature-detected client-side only — the server-rendered shell never assumes a capability
  // (mirrors ViewerStrip's own "never derive from anything request-specific" posture, though
  // this component is never itself server-rendered since it's gated behind `open`).
  const [webShareSupported, setWebShareSupported] = useState(false);

  useEffect(() => {
    if (!open) return;
    setToken(null);
    setError(null);
    setCopied(false);
    mintShareToken(kind)
      .then((minted) => setToken(minted))
      .catch(() => setError(shareCopy.genericError));
  }, [open, kind, targetId]);

  useEffect(() => {
    setWebShareSupported(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  if (!open) return null;

  const imageUrl = cardImageUrl(kind, targetId, format);
  const pageUrl =
    typeof window !== 'undefined' ? buildSharePageUrl(window.location.origin, pagePath, token) : pagePath;

  async function withBusyGuard(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch {
      setError(shareCopy.genericError);
    } finally {
      setBusy(false);
    }
  }

  const handleWebShare = () =>
    withBusyGuard(async () => {
      const file = await fetchCardFile(imageUrl, `receipt-${format}.png`);
      const outcome = await shareViaWebShare(file, pageUrl, title);
      if (outcome === 'shared') {
        postAnalyticsEvent('share_completed', { kind, method: 'web_share', format });
      }
    });

  const handleDownload = () =>
    withBusyGuard(async () => {
      const file = await fetchCardFile(imageUrl, `receipt-${format}.png`);
      triggerFileDownload(file);
      postAnalyticsEvent('share_completed', { kind, method: 'download', format });
    });

  const handleCopyLink = () =>
    withBusyGuard(async () => {
      await copyShareLink(pageUrl);
      setCopied(true);
      postAnalyticsEvent('share_completed', { kind, method: 'copy_link', format });
    });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      {/* Backdrop: a real (keyboard-focusable) button, same pattern as `ClaimSheet` (§10.4 a11y
          bar: "all interactive elements keyboard-operable"). */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={() => onOpenChange(false)}
        className="absolute inset-0 h-full w-full cursor-default bg-black/60"
      />
      <div
        className="bg-surface text-paper relative z-10 w-full max-w-sm space-y-4 rounded-lg p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label={shareCopy.sheetHeading}
        data-testid="share-sheet"
      >
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label={shareCopy.closeLabel}
          className="text-muted hover:text-paper absolute -top-2 -right-2 z-10 h-8 w-8 rounded-full bg-black/40 text-lg"
        >
          ×
        </button>

        <h2 className="text-lg font-bold">{shareCopy.sheetHeading}</h2>

        <div className="flex gap-2" role="group" aria-label="Card format">
          <button
            type="button"
            data-testid="share-format-square"
            aria-pressed={format === 'square'}
            onClick={() => setFormat('square')}
            className={`min-h-11 flex-1 rounded px-3 py-2 text-sm font-semibold ${
              format === 'square' ? 'bg-side-a text-white' : 'bg-bg text-muted'
            }`}
          >
            {shareCopy.formatSquareLabel}
          </button>
          <button
            type="button"
            data-testid="share-format-story"
            aria-pressed={format === 'story'}
            onClick={() => setFormat('story')}
            className={`min-h-11 flex-1 rounded px-3 py-2 text-sm font-semibold ${
              format === 'story' ? 'bg-side-a text-white' : 'bg-bg text-muted'
            }`}
          >
            {shareCopy.formatStoryLabel}
          </button>
        </div>

        {/* The card route itself embeds the §10.5 QR + page URL footer — this is a live preview
            of exactly what gets shared/downloaded, not a separate mock-up. Plain <img>, not
            next/image: the src is a same-origin dynamic route (content-addressed via the
            route's own `?v=` redirect), not a static/optimizable asset. */}
        <img src={imageUrl} alt="" className="w-full rounded-md border border-black/10" data-testid="share-preview-image" />

        <div className="space-y-2">
          {webShareSupported ? (
            <button
              type="button"
              data-testid="share-web-share"
              disabled={busy}
              onClick={handleWebShare}
              className="bg-side-a min-h-11 w-full rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {shareCopy.webShareLabel}
            </button>
          ) : null}
          <button
            type="button"
            data-testid="share-download"
            disabled={busy}
            onClick={handleDownload}
            className="bg-bg min-h-11 w-full rounded px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {shareCopy.downloadLabel}
          </button>
          <button
            type="button"
            data-testid="share-copy-link"
            disabled={busy}
            onClick={handleCopyLink}
            className="bg-bg min-h-11 w-full rounded px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {copied ? shareCopy.copyLinkCopiedLabel : shareCopy.copyLinkLabel}
          </button>
        </div>

        {error ? (
          <p className="text-loss text-xs" data-testid="share-sheet-error">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

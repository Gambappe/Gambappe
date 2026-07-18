/**
 * `ShareSheet` render coverage (WS8-T2, §10.5). Same `renderToStaticMarkup` convention as
 * `question-state-view.test.tsx` (no jsdom in this repo yet — see that file's header comment).
 * Effects (token minting, `navigator.share` feature detection) never run during a static
 * render, so this covers the closed/open shell shape only; the interactive share/download/
 * copy-link flows are covered by `e2e/share-sheet.spec.ts` and the pure logic in
 * `share-client.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ShareSheet from '@/components/share/ShareSheet';

describe('ShareSheet', () => {
  it('renders nothing when closed', () => {
    const html = renderToStaticMarkup(
      <ShareSheet
        kind="receipt"
        targetId="pick-1"
        pagePath="/q/foo"
        title="Will it happen?"
        open={false}
        onOpenChange={() => {}}
      />,
    );
    expect(html).toBe('');
  });

  it('renders the dialog, format toggle, preview image, download and copy-link controls when open', () => {
    const html = renderToStaticMarkup(
      <ShareSheet
        kind="receipt"
        targetId="pick-1"
        pagePath="/q/foo"
        title="Will it happen?"
        open
        onOpenChange={() => {}}
      />,
    );
    expect(html).toContain('data-testid="share-sheet"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('data-testid="share-format-square"');
    expect(html).toContain('data-testid="share-format-story"');
    expect(html).toContain('data-testid="share-preview-image"');
    expect(html).toContain('/api/cards/receipt/pick-1?format=square');
    expect(html).toContain('data-testid="share-download"');
    expect(html).toContain('data-testid="share-copy-link"');
    // navigator.share feature-detection is a useEffect — never runs during SSR/static render —
    // so the web-share button is absent here even though it may appear after hydration.
    expect(html).not.toContain('data-testid="share-web-share"');
  });

  it('URL-encodes the target id in the preview image src', () => {
    const html = renderToStaticMarkup(
      <ShareSheet
        kind="duo"
        targetId="duo with space"
        pagePath="/duos/foo"
        title="Duo"
        open
        onOpenChange={() => {}}
      />,
    );
    expect(html).toContain('/api/cards/duo/duo%20with%20space?format=square');
  });
});

/**
 * WS8-T2 unit: `lib/share-client.ts` — URL-building is pure and tested directly; `fetch`/
 * `navigator.share`/`navigator.clipboard` are stubbed via `vi.stubGlobal` (Node's own `fetch`/
 * `File`/`Blob` globals cover the fetch-based helpers; `navigator` is stubbed with a plain
 * mock object). `triggerFileDownload` needs a real DOM (`document.createElement`, anchor
 * click) — this repo has no jsdom/@testing-library dependency yet (see
 * `question-state-view.test.tsx`'s header comment for the established convention: DOM-
 * interactive behavior is covered by Playwright e2e instead, not a unit test); `e2e/share-
 * sheet.spec.ts` exercises the download button in a real browser.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildSharePageUrl,
  cardImageUrl,
  copyShareLink,
  CardFetchError,
  fetchCardFile,
  mintShareToken,
  ShareTokenError,
  shareViaWebShare,
} from '../lib/share-client';

describe('cardImageUrl', () => {
  it('builds the /api/cards/:kind/:id?format= URL', () => {
    expect(cardImageUrl('receipt', 'pick-1', 'square')).toBe('/api/cards/receipt/pick-1?format=square');
    expect(cardImageUrl('duo', 'duo-1', 'story')).toBe('/api/cards/duo/duo-1?format=story');
  });

  it('URL-encodes the target id', () => {
    expect(cardImageUrl('receipt', 'has space', 'square')).toBe('/api/cards/receipt/has%20space?format=square');
  });
});

describe('buildSharePageUrl', () => {
  it('appends ?r= when a token is given', () => {
    const url = buildSharePageUrl('https://receipts.example', '/q/foo', 'tok123');
    expect(url).toBe('https://receipts.example/q/foo?r=tok123');
  });

  it('omits ?r= when no token is available', () => {
    const url = buildSharePageUrl('https://receipts.example', '/q/foo', null);
    expect(url).toBe('https://receipts.example/q/foo');
  });
});

describe('mintShareToken', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns the minted token on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { token: 'tok123' } }),
    }) as unknown as typeof fetch;
    await expect(mintShareToken('receipt')).resolves.toBe('tok123');
  });

  it('throws ShareTokenError on a non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429 }) as unknown as typeof fetch;
    await expect(mintShareToken('receipt')).rejects.toBeInstanceOf(ShareTokenError);
  });

  it('throws ShareTokenError when the response has no token', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    }) as unknown as typeof fetch;
    await expect(mintShareToken('receipt')).rejects.toBeInstanceOf(ShareTokenError);
  });
});

describe('fetchCardFile', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns a File built from the response blob', async () => {
    const blob = new Blob(['fake-png-bytes'], { type: 'image/png' });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob }) as unknown as typeof fetch;
    const file = await fetchCardFile('/api/cards/receipt/pick-1?format=square', 'receipt-square.png');
    expect(file.name).toBe('receipt-square.png');
    expect(file.type).toBe('image/png');
  });

  it('throws CardFetchError on a non-ok response (e.g. 404 unknown pick)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch;
    await expect(fetchCardFile('/api/cards/receipt/nope?format=square', 'x.png')).rejects.toBeInstanceOf(
      CardFetchError,
    );
  });
});

describe('shareViaWebShare', () => {
  const file = new File(['x'], 'x.png', { type: 'image/png' });

  it('returns "unsupported" when navigator.share does not exist', async () => {
    vi.stubGlobal('navigator', {});
    await expect(shareViaWebShare(file, 'https://x/y', 'title')).resolves.toBe('unsupported');
    vi.unstubAllGlobals();
  });

  it('returns "unsupported" when canShare rejects the payload', async () => {
    vi.stubGlobal('navigator', { share: vi.fn(), canShare: () => false });
    await expect(shareViaWebShare(file, 'https://x/y', 'title')).resolves.toBe('unsupported');
    vi.unstubAllGlobals();
  });

  it('returns "shared" when navigator.share resolves', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share, canShare: () => true });
    await expect(shareViaWebShare(file, 'https://x/y', 'title')).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({ files: [file], url: 'https://x/y', title: 'title' });
    vi.unstubAllGlobals();
  });

  it('returns "cancelled" on AbortError (user dismissed the OS sheet)', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'));
    vi.stubGlobal('navigator', { share, canShare: () => true });
    await expect(shareViaWebShare(file, 'https://x/y', 'title')).resolves.toBe('cancelled');
    vi.unstubAllGlobals();
  });

  it('rethrows any other error', async () => {
    const share = vi.fn().mockRejectedValue(new Error('boom'));
    vi.stubGlobal('navigator', { share, canShare: () => true });
    await expect(shareViaWebShare(file, 'https://x/y', 'title')).rejects.toThrow('boom');
    vi.unstubAllGlobals();
  });
});

describe('copyShareLink', () => {
  it('writes the URL via navigator.clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await copyShareLink('https://x/y');
    expect(writeText).toHaveBeenCalledWith('https://x/y');
    vi.unstubAllGlobals();
  });
});


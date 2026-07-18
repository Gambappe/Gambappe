/**
 * WS8-T2 unit: `generateQrDataUri` (§10.5: "QR codes generated server-side (`qrcode` lib) into
 * the card render"). QR encoding is deterministic — no randomness, no network — so this is a
 * plain pure-function test, no mocking needed.
 *
 * The "decodes back to" tests below exist because the §10.5/WS8-T2 AC is specifically that "QR
 * resolves to page" — shape/determinism checks alone (is it a PNG data URI, same input ->
 * same output) don't prove the encoded payload is actually the URL a scanner would land on;
 * only decoding the rendered pixels back out does. `pngjs` (pure-JS PNG decoder) + `jsqr`
 * (pure-JS QR decoder) round-trip the data URI exactly the way a phone camera would: pixels in,
 * text out. Both are dependency-free dev-only tooling, not a runtime dependency of the card
 * routes themselves (`qrcode` remains the only runtime QR dependency).
 */
import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { generateQrDataUri } from '../lib/og/qr';

function decodeQrDataUri(dataUri: string): string | null {
  const base64 = dataUri.replace(/^data:image\/png;base64,/, '');
  const png = PNG.sync.read(Buffer.from(base64, 'base64'));
  const result = jsQR(new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.byteLength), png.width, png.height);
  return result?.data ?? null;
}

describe('generateQrDataUri', () => {
  it('returns a PNG data URI', async () => {
    const uri = await generateQrDataUri('https://receipts.example/q/foo');
    expect(uri).toMatch(/^data:image\/png;base64,/);
  });

  it('is deterministic for the same input', async () => {
    const a = await generateQrDataUri('https://receipts.example/q/foo');
    const b = await generateQrDataUri('https://receipts.example/q/foo');
    expect(a).toBe(b);
  });

  it('differs for different input text', async () => {
    const a = await generateQrDataUri('https://receipts.example/q/foo');
    const b = await generateQrDataUri('https://receipts.example/q/bar');
    expect(a).not.toBe(b);
  });

  it('decodes back to the exact canonical page URL it was minted for (§10.5 AC: "QR resolves to page")', async () => {
    const url = 'https://receipts.example/q/2026-07-19-world-cup-final';
    const uri = await generateQrDataUri(url);
    expect(decodeQrDataUri(uri)).toBe(url);
  });

  it.each([
    'https://receipts.example/p/some-handle',
    'https://receipts.example/vs/pairing-1',
    'https://receipts.example/duos/duo-1',
  ])('decodes back to %s for every §10.1 public route pattern the card footer links to', async (url) => {
    const uri = await generateQrDataUri(url);
    expect(decodeQrDataUri(uri)).toBe(url);
  });
});

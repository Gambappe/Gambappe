/**
 * WS8-T2 unit: `generateQrDataUri` (§10.5: "QR codes generated server-side (`qrcode` lib) into
 * the card render"). QR encoding is deterministic — no randomness, no network — so this is a
 * plain pure-function test, no mocking needed.
 */
import { describe, expect, it } from 'vitest';
import { generateQrDataUri } from '../lib/og/qr';

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
});

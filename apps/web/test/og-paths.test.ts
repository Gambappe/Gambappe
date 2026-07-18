/**
 * WS8-T2 unit: canonical page-path builders (§10.5) — the single source both `templates.tsx`'s
 * OG/card footers and `card-route-handler.ts`'s QR generation read from.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  absoluteUrl,
  duoPagePath,
  matchupPagePath,
  profilePagePath,
  questionPagePath,
} from '../lib/og/paths';

describe('og/paths', () => {
  it('builds the §10.1 route-table paths for each kind', () => {
    expect(questionPagePath('2026-07-19-world-cup-final')).toBe('/q/2026-07-19-world-cup-final');
    expect(matchupPagePath('pairing-1')).toBe('/vs/pairing-1');
    expect(profilePagePath('some-handle')).toBe('/p/some-handle');
    expect(duoPagePath('duo-1')).toBe('/duos/duo-1');
  });

  describe('absoluteUrl', () => {
    const original = process.env.NEXT_PUBLIC_APP_URL;

    beforeEach(() => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://receipts.example';
    });

    afterEach(() => {
      process.env.NEXT_PUBLIC_APP_URL = original;
    });

    it('joins NEXT_PUBLIC_APP_URL with the path', () => {
      expect(absoluteUrl('/q/foo')).toBe('https://receipts.example/q/foo');
    });

    it('falls back to the documented default host when unset', () => {
      delete process.env.NEXT_PUBLIC_APP_URL;
      expect(absoluteUrl('/q/foo')).toBe('https://receipts.example/q/foo');
    });
  });
});

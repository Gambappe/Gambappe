/**
 * WS8-T4 unit: `matchOembedUrl` (§10.5 same-host pattern-match) — the pure parsing logic behind
 * `GET /api/oembed`, exhaustively exercised without a database. The dedicated SSRF-rejection
 * suite (`oembed-ssrf.test.ts`) covers the security-critical negative cases named in this
 * task's AC directly; this file covers correctness of the happy paths and general parsing edge
 * cases.
 */
import { describe, expect, it } from 'vitest';
import { matchOembedUrl } from '../lib/oembed/route-matcher';

const APP_ORIGIN = 'https://receipts.example';

describe('matchOembedUrl — relative-path shape (what /q/[slug] emits today)', () => {
  it('matches a question path', () => {
    expect(matchOembedUrl('/q/2026-07-18-world-cup', APP_ORIGIN)).toEqual({
      kind: 'question',
      id: '2026-07-18-world-cup',
    });
  });

  it('matches a profile path', () => {
    expect(matchOembedUrl('/p/fox-4821', APP_ORIGIN)).toEqual({ kind: 'profile', id: 'fox-4821' });
  });

  it('matches a matchup path', () => {
    const id = '018f1e2b-0000-7000-8000-0000000000e1';
    expect(matchOembedUrl(`/vs/${id}`, APP_ORIGIN)).toEqual({ kind: 'matchup', id });
  });

  it('matches a duo path', () => {
    const id = '018f1e2b-0000-7000-8000-0000000000e2';
    expect(matchOembedUrl(`/duos/${id}`, APP_ORIGIN)).toEqual({ kind: 'duo', id });
  });

  it('tolerates a trailing slash', () => {
    expect(matchOembedUrl('/q/foo/', APP_ORIGIN)).toEqual({ kind: 'question', id: 'foo' });
  });

  it('drops a query string / fragment before matching', () => {
    expect(matchOembedUrl('/q/foo?utm_source=x', APP_ORIGIN)).toEqual({
      kind: 'question',
      id: 'foo',
    });
    expect(matchOembedUrl('/p/foo#section', APP_ORIGIN)).toEqual({ kind: 'profile', id: 'foo' });
  });

  it('decodes a percent-encoded slug segment', () => {
    expect(matchOembedUrl('/q/hello%20world', APP_ORIGIN)).toEqual({
      kind: 'question',
      id: 'hello world',
    });
  });
});

describe('matchOembedUrl — absolute-URL shape (what /p/[slug] emits today)', () => {
  it('matches when the absolute URL is https and same-host', () => {
    expect(matchOembedUrl(`${APP_ORIGIN}/p/fox-4821`, APP_ORIGIN)).toEqual({
      kind: 'profile',
      id: 'fox-4821',
    });
  });

  it('matches regardless of the configured origin scheme, as long as rawUrl is https', () => {
    // NEXT_PUBLIC_APP_URL is often http:// in local dev; the incoming url= must still be https.
    expect(matchOembedUrl('https://localhost:3000/q/foo', 'http://localhost:3000')).toEqual({
      kind: 'question',
      id: 'foo',
    });
  });

  it('matches an already-percent-encoded URL slug', () => {
    expect(matchOembedUrl(`${APP_ORIGIN}/q/hello%20world`, APP_ORIGIN)).toEqual({
      kind: 'question',
      id: 'hello world',
    });
  });
});

describe('matchOembedUrl — no match', () => {
  it('null/undefined/empty url', () => {
    expect(matchOembedUrl(null, APP_ORIGIN)).toBeNull();
    expect(matchOembedUrl(undefined, APP_ORIGIN)).toBeNull();
    expect(matchOembedUrl('', APP_ORIGIN)).toBeNull();
  });

  it('a path with no recognized prefix', () => {
    expect(matchOembedUrl('/nope/foo', APP_ORIGIN)).toBeNull();
  });

  it('a bare route with no id segment', () => {
    expect(matchOembedUrl('/q/', APP_ORIGIN)).toBeNull();
    expect(matchOembedUrl('/q', APP_ORIGIN)).toBeNull();
  });

  it('extra path segments beyond the id', () => {
    expect(matchOembedUrl('/q/foo/bar', APP_ORIGIN)).toBeNull();
  });
});

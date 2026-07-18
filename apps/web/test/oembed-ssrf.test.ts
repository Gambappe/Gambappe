/**
 * WS8-T4 SSRF-rejection suite (§10.5, §19.3 AC: "foreign/internal `url` values → 404 (SSRF
 * test)"; §14.1 RT-B). This is the task's security-critical acceptance test, kept as its own
 * dedicated file per the task brief.
 *
 * `matchOembedUrl` NEVER performs network I/O — see its header comment. Every case below
 * asserts it returns `null` (which the route handler turns into a plain 404, indistinguishable
 * from "unknown slug") for a `url=` value an attacker might use to try to make this endpoint
 * probe or reach somewhere it shouldn't. There is no scenario in which this parser calls
 * `fetch`, opens a socket, or performs DNS resolution — these tests exist to prove the *parser*
 * itself refuses to even recognize such values as a match, which is the actual SSRF defense
 * (the code simply has no path from "matched" to "network request" at all, but a parser bug
 * that accidentally matched a foreign host would still be a live vulnerability if this endpoint
 * were ever changed to act on the match differently — hence testing rejection at this layer
 * directly).
 */
import { describe, expect, it } from 'vitest';
import { matchOembedUrl } from '../lib/oembed/route-matcher';

const APP_ORIGIN = 'https://receipts.example';

describe('SSRF: foreign host', () => {
  it('rejects a different domain entirely', () => {
    expect(matchOembedUrl('https://evil.example/q/foo', APP_ORIGIN)).toBeNull();
  });

  it('rejects a subdomain trick (not an exact host match)', () => {
    expect(matchOembedUrl('https://receipts.example.evil.com/q/foo', APP_ORIGIN)).toBeNull();
  });

  it('rejects userinfo-prefixed URL confusion (https://receipts.example@evil.com/...)', () => {
    // Browsers/URL parse this as host=evil.com, userinfo=receipts.example — a classic SSRF
    // trick against naive string-prefix checks. Must still resolve host !== origin.host.
    expect(matchOembedUrl('https://receipts.example@evil.example/q/foo', APP_ORIGIN)).toBeNull();
  });

  it('rejects a scheme-relative //host URL masquerading as a bare path', () => {
    expect(matchOembedUrl('//evil.example/q/foo', APP_ORIGIN)).toBeNull();
  });
});

describe('SSRF: internal/private-IP-shaped host', () => {
  it('rejects loopback', () => {
    expect(matchOembedUrl('https://127.0.0.1/q/foo', APP_ORIGIN)).toBeNull();
    expect(matchOembedUrl('https://localhost/q/foo', APP_ORIGIN)).toBeNull();
  });

  it('rejects a cloud metadata endpoint', () => {
    expect(matchOembedUrl('https://169.254.169.254/latest/meta-data/', APP_ORIGIN)).toBeNull();
  });

  it('rejects RFC1918 private ranges', () => {
    expect(matchOembedUrl('https://10.0.0.5/q/foo', APP_ORIGIN)).toBeNull();
    expect(matchOembedUrl('https://192.168.1.1/q/foo', APP_ORIGIN)).toBeNull();
    expect(matchOembedUrl('https://172.16.0.1/q/foo', APP_ORIGIN)).toBeNull();
  });

  it('rejects IPv6 loopback', () => {
    expect(matchOembedUrl('https://[::1]/q/foo', APP_ORIGIN)).toBeNull();
  });
});

describe('SSRF: scheme other than https', () => {
  it('rejects plain http even to the correct host', () => {
    expect(matchOembedUrl('http://receipts.example/q/foo', APP_ORIGIN)).toBeNull();
  });

  it('rejects a non-http(s) scheme (file://)', () => {
    expect(matchOembedUrl('file:///etc/passwd', APP_ORIGIN)).toBeNull();
  });

  it('rejects a non-http(s) scheme (ftp://)', () => {
    expect(matchOembedUrl('ftp://receipts.example/q/foo', APP_ORIGIN)).toBeNull();
  });

  it('rejects gopher:// (classic SSRF-to-internal-protocol vector)', () => {
    expect(matchOembedUrl('gopher://127.0.0.1:6379/_SET%20foo%20bar', APP_ORIGIN)).toBeNull();
  });
});

describe('SSRF: path that doesn’t match any known route', () => {
  it('rejects an unrelated same-host path', () => {
    expect(matchOembedUrl('https://receipts.example/admin/secret', APP_ORIGIN)).toBeNull();
    expect(matchOembedUrl('/api/v1/internal/revalidate', APP_ORIGIN)).toBeNull();
  });

  it('rejects the API/OG namespaces themselves (not public page routes)', () => {
    expect(matchOembedUrl('/api/og/question/foo', APP_ORIGIN)).toBeNull();
  });

  it('rejects the bare root', () => {
    expect(matchOembedUrl('/', APP_ORIGIN)).toBeNull();
  });
});

describe('SSRF: path traversal', () => {
  it('rejects a literal .. segment', () => {
    expect(matchOembedUrl('/q/..', APP_ORIGIN)).toBeNull();
  });

  it('rejects an unencoded traversal attempt (extra slashes never match the single-segment pattern)', () => {
    expect(matchOembedUrl('/q/../../etc/passwd', APP_ORIGIN)).toBeNull();
  });

  it('rejects a percent-encoded traversal attempt (%2f decodes to a slash post-match)', () => {
    expect(matchOembedUrl('/q/..%2f..%2fetc%2fpasswd', APP_ORIGIN)).toBeNull();
    expect(
      matchOembedUrl(`https://receipts.example/q/..%2f..%2fetc%2fpasswd`, APP_ORIGIN),
    ).toBeNull();
  });

  it('rejects a malformed percent-encoding that would throw on decode', () => {
    expect(matchOembedUrl('/q/%E0%A4%A', APP_ORIGIN)).toBeNull();
  });
});

describe('SSRF: malformed url= values fail closed, never throw', () => {
  it('a garbage absolute-looking string', () => {
    expect(() => matchOembedUrl('https://', APP_ORIGIN)).not.toThrow();
    expect(matchOembedUrl('https://', APP_ORIGIN)).toBeNull();
  });

  it('control characters / whitespace', () => {
    expect(matchOembedUrl('  https://evil.example/q/foo', APP_ORIGIN)).toBeNull();
  });
});

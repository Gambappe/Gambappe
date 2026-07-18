/**
 * Share attribution token signing (design doc §10.5, WS8-T2): "card/page URLs minted by the
 * share sheet carry `?r=<opaque token>` (HMAC-signed with `SHARE_TOKEN_SECRET`) encoding
 * `{artifact_kind, minted_at}`; the pick API uses it to derive `source` server-side (§6.2 step
 * 1)." `SHARE_TOKEN_SECRET` is already listed in Appendix B (env vars) — this file is the first
 * thing to actually read it, and the one place the token format is defined.
 *
 * Same shape as `notifications-token.ts`'s one-click unsubscribe token (base64url JSON payload
 * + hex HMAC-SHA256 signature) — reusing that pattern rather than inventing a second one.
 * Needs `node:crypto`, so this lives in the `/server` subpath only (see that file's own header
 * comment on why: bundling `node:crypto` into a client component fails the Next.js build — the
 * exact bug that bit two other tasks earlier this session before the `/server` split landed).
 *
 * Non-expiring by design, same posture as the unsubscribe token: `minted_at` is carried for
 * analytics/debugging (how stale was the share link that converted?), not as a TTL enforced at
 * verify time — a share link that still works a year later is a feature, not a bug, for an
 * evergreen artifact like a profile or receipt card.
 *
 * SPEC-GAP(WS8-T2): this file mints and verifies the token format `?r=` needs. It does NOT wire
 * the client-side "read `?r=` off the landing URL and echo it as the `x-receipts-share-r`
 * header at pick-creation time" — that's the pick-creation UI flow (`apps/web/lib/pick-client.ts`
 * / `ViewerStrip`'s pick submission), not this task's surface per the §19.3 WS8-T2 row (share
 * cards + share sheet UI). `apps/web/lib/pick-source.ts` already has a matching SPEC-GAP note
 * ("share-card link minting/signing is WS8 scope ... no token format exists yet") pointing back
 * here; wiring `verifyShareToken` into that header check is left for whichever task next
 * touches the pick-creation client path, flagged explicitly rather than silently left as dead
 * code neither side can find.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ShareArtifactKind } from './enums.js';

export interface ShareTokenPayload {
  artifactKind: ShareArtifactKind;
  mintedAt: number;
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function sign(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('hex');
}

/** Signs a `?r=` share attribution token for `payload`. */
export function signShareToken(payload: ShareTokenPayload, secret: string): string {
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

const KNOWN_KINDS = new Set<string>(['question', 'receipt', 'matchup', 'profile', 'duo']);

/** Verifies a token minted by `signShareToken`; `null` on any malformed/forged/tampered input. */
export function verifyShareToken(token: string, secret: string): ShareTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, signature] = parts as [string, string];
  const expected = sign(payloadB64, secret);
  const expectedBuf = Buffer.from(expected, 'hex');
  const actualBuf = Buffer.from(signature, 'hex');
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(base64UrlDecode(payloadB64));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>)['artifactKind'] === 'string' &&
      KNOWN_KINDS.has((parsed as Record<string, unknown>)['artifactKind'] as string) &&
      typeof (parsed as Record<string, unknown>)['mintedAt'] === 'number'
    ) {
      return parsed as ShareTokenPayload;
    }
    return null;
  } catch {
    return null;
  }
}

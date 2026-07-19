/**
 * `SHARE_TOKEN_SECRET` env accessor (design doc Appendix B, §10.5) — same one-pinned-secret
 * posture as `wallet-hash.ts`'s `WALLET_HASH_SECRET` accessor: throw loudly at call time if
 * unset rather than silently signing with `undefined`. The actual sign/verify logic lives in
 * `@receipts/core/server`'s `share-token.ts` (WS8-T2) since it needs `node:crypto` — this file
 * is the thin server-only (this whole file is only ever imported by route handlers, never a
 * client component) env-reading wrapper around it.
 */
import { signShareToken, verifyShareToken, type ShareTokenPayload } from '@receipts/core/server';
import type { ShareArtifactKind } from '@receipts/core';

function shareTokenSecret(): string {
  const key = process.env.SHARE_TOKEN_SECRET;
  if (!key) throw new Error('SHARE_TOKEN_SECRET is not set (see .env.example)');
  return key;
}

export function mintShareToken(artifactKind: ShareArtifactKind, mintedAt: number = Date.now()): string {
  return signShareToken({ artifactKind, mintedAt }, shareTokenSecret());
}

export function readShareToken(token: string): ShareTokenPayload | null {
  return verifyShareToken(token, shareTokenSecret());
}

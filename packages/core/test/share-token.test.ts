/**
 * WS8-T2: `?r=` share attribution token sign/verify round-trip (§10.5). Mirrors
 * `notifications-token.test.ts`'s coverage shape since the two tokens share a format.
 */
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signShareToken, verifyShareToken } from '../src/share-token.js';

describe('share token sign/verify round-trip', () => {
  const secret = 'test-share-secret';

  it('round-trips artifactKind + mintedAt', () => {
    const token = signShareToken({ artifactKind: 'receipt', mintedAt: 1_700_000_000_000 }, secret);
    expect(verifyShareToken(token, secret)).toEqual({
      artifactKind: 'receipt',
      mintedAt: 1_700_000_000_000,
    });
  });

  it('round-trips every §10.5 artifact kind', () => {
    for (const artifactKind of ['question', 'receipt', 'matchup', 'profile', 'duo'] as const) {
      const token = signShareToken({ artifactKind, mintedAt: 0 }, secret);
      expect(verifyShareToken(token, secret)?.artifactKind).toBe(artifactKind);
    }
  });

  it('rejects a token signed with a different secret', () => {
    const token = signShareToken({ artifactKind: 'profile', mintedAt: 1 }, secret);
    expect(verifyShareToken(token, 'wrong-secret')).toBeNull();
  });

  it('rejects a tampered payload (signature no longer matches)', () => {
    const token = signShareToken({ artifactKind: 'duo', mintedAt: 1 }, secret);
    const [payloadB64, signature] = token.split('.') as [string, string];
    const tamperedPayload = Buffer.from(
      JSON.stringify({ artifactKind: 'profile', mintedAt: 1 }),
    ).toString('base64url');
    expect(verifyShareToken(`${tamperedPayload}.${signature}`, secret)).toBeNull();
    expect(payloadB64).not.toBe(tamperedPayload);
  });

  it('rejects an unknown artifactKind even with a valid signature', () => {
    // Sign a payload shaped like the real thing but with a kind outside SHARE_ARTIFACT_KIND —
    // simulates a forged/future-version token, not just bit-flip tampering.
    const payloadB64 = Buffer.from(
      JSON.stringify({ artifactKind: 'not-a-real-kind', mintedAt: 1 }),
    ).toString('base64url');
    const signature = createHmac('sha256', secret).update(payloadB64).digest('hex');
    expect(verifyShareToken(`${payloadB64}.${signature}`, secret)).toBeNull();
  });

  it('rejects malformed tokens without throwing', () => {
    expect(verifyShareToken('not-a-token', secret)).toBeNull();
    expect(verifyShareToken('', secret)).toBeNull();
    expect(verifyShareToken('a.b.c', secret)).toBeNull();
  });
});

/**
 * WS8-T2 integration: `POST /api/share/token` (§10.5) against real Redis (rate limiting).
 * No Postgres dependency — minting needs no entity lookup (see the route's own header
 * comment) — but it's still `test/integration/*` rather than a plain unit test because it
 * exercises the real rate-limit bucket against Redis, same as `test/integration/rate-limit.test.ts`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Redis } from 'ioredis';
import { verifyShareToken } from '@receipts/core/server';
import { POST } from '../../app/api/share/token/route';

const redisUrl = process.env.TEST_REDIS_URL ?? process.env.REDIS_URL ?? 'redis://localhost:6379';
const SECRET = 'integration-test-share-token-secret';

let redis: Redis;

beforeAll(async () => {
  redis = new Redis(redisUrl);
  await redis.flushdb();
  process.env.REDIS_URL = redisUrl;
  process.env.NEXT_PUBLIC_APP_URL ??= 'http://localhost:3000';
  process.env.SHARE_TOKEN_SECRET = SECRET;
});

afterAll(async () => {
  await redis.quit();
});

function postRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/share/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...headers },
    body: JSON.stringify(body),
  });
}

describe('POST /api/share/token (§10.5)', () => {
  it('mints a token that verifies to the requested artifact_kind', async () => {
    const res = await POST(postRequest({ artifact_kind: 'receipt' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { token: string } };
    const payload = verifyShareToken(body.data.token, SECRET);
    expect(payload?.artifactKind).toBe('receipt');
    expect(typeof payload?.mintedAt).toBe('number');
  });

  it('400s on an unknown artifact_kind', async () => {
    const res = await POST(postRequest({ artifact_kind: 'not-a-kind' }));
    expect(res.status).toBe(400);
  });

  it('400s on a malformed body', async () => {
    const res = await POST(
      new Request('http://localhost/api/share/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
        body: 'not json',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('403s a cross-site POST (§11.2 CSRF)', async () => {
    const res = await POST(postRequest({ artifact_kind: 'receipt' }, { 'sec-fetch-site': 'cross-site' }));
    expect(res.status).toBe(403);
  });

  it('a token minted here fails verification against a different secret (no shared-secret leakage)', async () => {
    const res = await POST(postRequest({ artifact_kind: 'duo' }));
    const body = (await res.json()) as { data: { token: string } };
    expect(verifyShareToken(body.data.token, 'wrong-secret')).toBeNull();
  });
});

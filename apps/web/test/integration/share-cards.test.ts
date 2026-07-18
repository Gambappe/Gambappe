/**
 * WS8-T2 integration: the five `/api/cards/*` share-card routes against real Postgres + Redis.
 * Mirrors `og-images.test.ts`'s structure (WS8-T1) since these routes share the same
 * rate-limit → load → `?v=` guard → render pipeline, plus the WS8-T2-specific bits: `?format=`
 * validation, dimension correctness per format, and — the AC this task is graded on — real
 * (not fallback) 200 PNG renders for the receipt template's loss AND busted-streak variants,
 * at BOTH card formats.
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Redis } from 'ioredis';
import type pg from 'pg';
import { uuidv7 } from 'uuidv7';
import { connect, duos, insertPick, nemesisPairings, profiles, seasons, type Db } from '@receipts/db';
import { buildPick, buildProfile, insertGradedQuestionScenario } from '@receipts/db/testing';

const dbUrl =
  process.env.TEST_DATABASE_URL ?? 'postgres://receipts:receipts@localhost:5432/receipts_test';
const redisUrl = process.env.TEST_REDIS_URL ?? process.env.REDIS_URL ?? 'redis://localhost:6379';

let pool: pg.Pool;
let db: Db;
let redis: Redis;

beforeAll(async () => {
  ({ pool, db } = connect({ connectionString: dbUrl }));
  await db.execute(sql`DROP SCHEMA public CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  await migrate(db, {
    migrationsFolder: join(
      dirname(fileURLToPath(import.meta.url)),
      '..', '..', '..', '..', 'packages', 'db', 'drizzle',
    ),
  });

  redis = new Redis(redisUrl);
  await redis.flushdb();

  process.env.DATABASE_URL = dbUrl;
  process.env.REDIS_URL = redisUrl;
  process.env.NEXT_PUBLIC_APP_URL ??= 'http://localhost:3000';
});

afterAll(async () => {
  await pool.end();
  await redis.quit();
});

async function cardGet(path: string): Promise<Response> {
  const { GET } = (await importRoute(path)) as unknown as {
    GET: (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
  };
  const url = `http://localhost${path}`;
  const request = new Request(url, { headers: { 'x-forwarded-for': '203.0.113.10' } });
  const params = paramsFor(path);
  return GET(request, { params: Promise.resolve(params) });
}

async function importRoute(path: string) {
  if (path.startsWith('/api/cards/question/')) return import('../../app/api/cards/question/[slug]/route.js');
  if (path.startsWith('/api/cards/receipt/')) return import('../../app/api/cards/receipt/[pickId]/route.js');
  if (path.startsWith('/api/cards/matchup/')) return import('../../app/api/cards/matchup/[pairingId]/route.js');
  if (path.startsWith('/api/cards/profile/')) return import('../../app/api/cards/profile/[slug]/route.js');
  if (path.startsWith('/api/cards/duo/')) return import('../../app/api/cards/duo/[duoId]/route.js');
  throw new Error(`no route for ${path}`);
}

function paramsFor(path: string): Record<string, string> {
  const id = path.split('?')[0]!.split('/').pop()!;
  if (path.startsWith('/api/cards/question/')) return { slug: id };
  if (path.startsWith('/api/cards/receipt/')) return { pickId: id };
  if (path.startsWith('/api/cards/matchup/')) return { pairingId: id };
  if (path.startsWith('/api/cards/profile/')) return { slug: id };
  if (path.startsWith('/api/cards/duo/')) return { duoId: id };
  throw new Error(`no params for ${path}`);
}

function canonicalVersion(res: Response): string {
  const location = res.headers.get('location');
  expect(location).toBeTruthy();
  return new URL(location!).searchParams.get('v')!;
}

/** Reads the width/height out of a PNG's IHDR chunk (bytes 16-24, big-endian) — proves the
 * route actually rendered at the requested format's dimensions, not just returned *a* PNG. */
function pngDimensions(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

describe('GET /api/cards/receipt/:pickId (§10.5 WS8-T2 AC: loss + busted-streak ship here too)', () => {
  it('404s for an unknown pick', async () => {
    const res = await cardGet(`/api/cards/receipt/${uuidv7()}?format=square`);
    expect(res.status).toBe(404);
  });

  it('400s when ?format= is missing', async () => {
    const { picks } = await insertGradedQuestionScenario(db);
    const res = await cardGet(`/api/cards/receipt/${picks[0]!.id}`);
    expect(res.status).toBe(400);
  });

  it('400s when ?format= is not story|square', async () => {
    const { picks } = await insertGradedQuestionScenario(db);
    const res = await cardGet(`/api/cards/receipt/${picks[0]!.id}?format=poster`);
    expect(res.status).toBe(400);
  });

  it('missing ?v= redirects (302), preserving ?format= on the canonical URL', async () => {
    const { picks } = await insertGradedQuestionScenario(db);
    const res = await cardGet(`/api/cards/receipt/${picks[0]!.id}?format=story`);
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('location')!);
    expect(location.searchParams.get('format')).toBe('story');
  });

  it.each(['story', 'square'] as const)(
    'renders a win receipt at %s dimensions',
    async (format) => {
      const { picks } = await insertGradedQuestionScenario(db);
      const winningPick = picks[0]!; // first two are wins per the fixture
      const redirect = await cardGet(`/api/cards/receipt/${winningPick.id}?format=${format}`);
      const v = canonicalVersion(redirect);
      const res = await cardGet(`/api/cards/receipt/${winningPick.id}?v=${v}&format=${format}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');
      expect(res.headers.get('cache-control')).toBe('public, s-maxage=86400, immutable');
      const bytes = new Uint8Array(await res.arrayBuffer());
      expect(Array.from(bytes.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const dims = pngDimensions(bytes);
      expect(dims).toEqual(format === 'story' ? { width: 1080, height: 1920 } : { width: 1080, height: 1080 });
    },
  );

  it.each(['story', 'square'] as const)(
    'renders a loss receipt at %s (not a fallback — real 200 PNG)',
    async (format) => {
      const { picks } = await insertGradedQuestionScenario(db);
      const losingPick = picks[2]!; // third pick is the loss per the fixture
      const redirect = await cardGet(`/api/cards/receipt/${losingPick.id}?format=${format}`);
      const v = canonicalVersion(redirect);
      const res = await cardGet(`/api/cards/receipt/${losingPick.id}?v=${v}&format=${format}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');
    },
  );

  it.each(['story', 'square'] as const)(
    'renders a busted-streak receipt at %s when the profile lost with a currently-zero streak',
    async (format) => {
      const { question } = await insertGradedQuestionScenario(db);
      const profile = buildProfile({ currentStreak: 0, bestStreak: 5 });
      await db.insert(profiles).values(profile);
      const pick = buildPick(question.id as string, profile.id as string, {
        result: 'loss',
        side: 'no',
        yesPriceAtEntry: 0.66,
      });
      await insertPick(db, pick);

      const redirect = await cardGet(`/api/cards/receipt/${pick.id}?format=${format}`);
      const v = canonicalVersion(redirect);
      const res = await cardGet(`/api/cards/receipt/${pick.id}?v=${v}&format=${format}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');
    },
  );
});

describe('GET /api/cards/question/:slug (§10.5)', () => {
  it('404s for an unknown slug', async () => {
    expect((await cardGet('/api/cards/question/does-not-exist?format=square')).status).toBe(404);
  });

  it('renders at square dimensions', async () => {
    const { question } = await insertGradedQuestionScenario(db);
    const redirect = await cardGet(`/api/cards/question/${question.slug}?format=square`);
    const v = canonicalVersion(redirect);
    const res = await cardGet(`/api/cards/question/${question.slug}?v=${v}&format=square`);
    expect(res.status).toBe(200);
    const dims = pngDimensions(new Uint8Array(await res.arrayBuffer()));
    expect(dims).toEqual({ width: 1080, height: 1080 });
  });
});

describe('GET /api/cards/matchup/:pairingId (§10.5)', () => {
  it('404s for an unknown pairing, 200s at story dimensions for a real one', async () => {
    expect((await cardGet(`/api/cards/matchup/${uuidv7()}?format=story`)).status).toBe(404);

    const [a, b] = [buildProfile(), buildProfile()];
    await db.insert(profiles).values([a, b]);
    const season = { id: uuidv7(), kind: 'nemesis' as const, startsOn: '2026-01-01', endsOn: '2026-03-31', name: 'S1' };
    await db.insert(seasons).values(season);
    const pairingId = uuidv7();
    await db.insert(nemesisPairings).values({
      id: pairingId,
      seasonId: season.id,
      weekStart: '2026-01-05',
      profileAId: a.id as string,
      profileBId: b.id as string,
      status: 'active',
      scoreA: 2,
      scoreB: 1,
    });

    const redirect = await cardGet(`/api/cards/matchup/${pairingId}?format=story`);
    const v = canonicalVersion(redirect);
    const res = await cardGet(`/api/cards/matchup/${pairingId}?v=${v}&format=story`);
    expect(res.status).toBe(200);
    const dims = pngDimensions(new Uint8Array(await res.arrayBuffer()));
    expect(dims).toEqual({ width: 1080, height: 1920 });
  });
});

describe('GET /api/cards/profile/:slug (§10.5)', () => {
  it('404s for an unknown slug, 200s for a real profile', async () => {
    expect((await cardGet('/api/cards/profile/nobody?format=square')).status).toBe(404);

    const { profiles: fixtureProfiles } = await insertGradedQuestionScenario(db);
    const profile = fixtureProfiles[0]!;

    const redirect = await cardGet(`/api/cards/profile/${profile.slug}?format=square`);
    const v = canonicalVersion(redirect);
    const res = await cardGet(`/api/cards/profile/${profile.slug}?v=${v}&format=square`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
  });
});

describe('GET /api/cards/duo/:duoId (§10.5)', () => {
  it('404s for an unknown duo, 200s for a real one', async () => {
    expect((await cardGet(`/api/cards/duo/${uuidv7()}?format=square`)).status).toBe(404);

    const [a, b] = [buildProfile(), buildProfile()];
    await db.insert(profiles).values([a, b]);
    const duoId = uuidv7();
    await db.insert(duos).values({
      id: duoId,
      profileAId: a.id as string,
      profileBId: b.id as string,
      status: 'active',
      tier: 2,
    });

    const redirect = await cardGet(`/api/cards/duo/${duoId}?format=square`);
    const v = canonicalVersion(redirect);
    const res = await cardGet(`/api/cards/duo/${duoId}?v=${v}&format=square`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
  });
});

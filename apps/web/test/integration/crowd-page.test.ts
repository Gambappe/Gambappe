/**
 * WS22-T2 integration (journeys-plan §5, D-J7): `getCrowdBoards` composed against a real Postgres.
 * Proves the `/crowd` server model fetches through the lib (`getLeaderboardPicksForWeek` +
 * `rankLeaderboard`) — no self-HTTP — and produces the Overall-first, per-category board set the
 * page renders, with the `live` week flag. The rank/tiebreak/eligibility logic itself is covered by
 * the pure unit suite (`test/leaderboards.test.ts`); this covers the page-model composition + window
 * math + board ordering end to end.
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type pg from 'pg';
import { MARKET_CATEGORY } from '@receipts/core';
import { connect, markets, picks, profiles, questions, type Db } from '@receipts/db';
import { buildMarket, buildPick, buildProfile, buildQuestion } from '@receipts/db/testing';
import { getCrowdBoards } from '@/lib/leaderboard-page';

const dbUrl =
  process.env.TEST_DATABASE_URL ?? 'postgres://receipts:receipts@localhost:5432/receipts_test';

let pool: pg.Pool;
let db: Db;

beforeAll(async () => {
  ({ pool, db } = connect({ connectionString: dbUrl }));
  await db.execute(sql`DROP SCHEMA public CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  await migrate(db, {
    migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'packages', 'db', 'drizzle'),
  });
});

afterAll(async () => {
  await pool.end();
});

/** Seed one eligible claimed profile with 3 revealed `sports` wins in the week of 2026-09-14. */
async function seedSportsWinner(): Promise<{ profileId: string; slug: string }> {
  const claimed = buildProfile({ kind: 'claimed', ghostSecretHash: null });
  await db.insert(profiles).values(claimed);
  for (let i = 0; i < 3; i++) {
    const market = buildMarket({ category: 'sports' });
    await db.insert(markets).values(market);
    const q = buildQuestion(market.id as string, { questionDate: `2026-09-1${4 + i}`, status: 'revealed' });
    await db.insert(questions).values(q);
    await db.insert(picks).values(buildPick(q.id as string, claimed.id as string, { result: 'win', edge: 0.3 }));
  }
  return { profileId: claimed.id as string, slug: claimed.slug as string };
}

describe('getCrowdBoards (§5 D-J7)', () => {
  it('returns Overall first then every market category, in order', async () => {
    const view = await getCrowdBoards(db, { weekStart: '2026-09-14', at: new Date('2026-09-15T12:00:00Z') });
    expect(view.boards.map((b) => b.category)).toEqual(['overall', ...MARKET_CATEGORY]);
    expect(view.weekStart).toBe('2026-09-14');
  });

  it('ranks the eligible profile on both Overall and its category board; unrelated boards are empty', async () => {
    const { profileId } = await seedSportsWinner();
    const view = await getCrowdBoards(db, { weekStart: '2026-09-14', at: new Date('2026-09-15T12:00:00Z') });

    const overall = view.boards.find((b) => b.category === 'overall');
    const sports = view.boards.find((b) => b.category === 'sports');
    const politics = view.boards.find((b) => b.category === 'politics');

    expect(overall?.entries.map((e) => e.profile.profile_id)).toContain(profileId);
    expect(sports?.entries.map((e) => e.profile.profile_id)).toContain(profileId);
    expect(overall?.entries[0]?.wins).toBe(3);
    expect(politics?.entries).toEqual([]);
  });

  it('flags the in-progress week live, a finished week not live', async () => {
    const liveView = await getCrowdBoards(db, { weekStart: '2026-09-14', at: new Date('2026-09-16T12:00:00Z') });
    expect(liveView.live).toBe(true);

    const pastView = await getCrowdBoards(db, { weekStart: '2026-09-14', at: new Date('2026-10-01T12:00:00Z') });
    expect(pastView.live).toBe(false);
  });
});

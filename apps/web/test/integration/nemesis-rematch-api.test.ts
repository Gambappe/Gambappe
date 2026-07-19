/**
 * WS5-T5 integration (§8.4 step 0, §9.2 `POST /rematch-requests*`) against a real Postgres —
 * exercises `apps/web/lib/nemesis/rematch.ts` directly rather than the Next.js route handlers,
 * matching `nemesis-matchup-api.test.ts`'s own header note: route auth (Auth.js session
 * resolution) isn't mocked anywhere in this repo, so every mode-lifecycle integration test
 * exercises `lib/` functions directly — each route's own wiring is a thin parse-then-delegate
 * layer with no extra logic of its own (see the route files themselves).
 *
 * Also covers `getNemesisHistoryPage`'s WS5-T5 contract-change addition (`rematch_request` per
 * history entry, `@receipts/core`'s `nemesisRematchStateSchema`).
 *
 * Connects via TEST_DATABASE_URL (CI sets this to receipts_test — see every other integration
 * test's fallback default).
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { uuidv7 } from 'uuidv7';
import type pg from 'pg';
import { ApiError } from '@receipts/core';
import {
  connect,
  nemesisPairings,
  notifications,
  profiles,
  rematchRequests,
  seasons,
  type Db,
  type ProfileRow,
} from '@receipts/db';
import { buildNemesisPairing, buildProfile, buildSeason } from '@receipts/db/testing';
import { getNemesisHistoryPage } from '@/lib/nemesis/service';
import { requestRematch, respondToRematchRequest } from '@/lib/nemesis/rematch';

const dbUrl = process.env.TEST_DATABASE_URL ?? 'postgres://receipts:receipts@localhost:5432/receipts_test';

const NOW = new Date('2026-07-19T18:00:00Z'); // a Sunday, mid nemesis week

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

beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE TABLE notifications, rematch_requests, pairing_questions, nemesis_pairings, profiles, seasons RESTART IDENTITY CASCADE`,
  );
});

async function makeClaimedProfile(overrides: Partial<ProfileRow> = {}): Promise<ProfileRow> {
  const [row] = await db.insert(profiles).values(buildProfile({ kind: 'claimed', status: 'active', ...overrides })).returning();
  return row!;
}

/** A season covering `NOW` — "this season" for §9.2's "target must be a past nemesis this
 * season" rule. */
async function makeCurrentSeason(): Promise<string> {
  const [row] = await db.insert(seasons).values(buildSeason({ startsOn: '2026-07-06', endsOn: '2026-09-28' })).returning();
  return row!.id;
}

async function makeTerminalPairing(
  seasonId: string,
  profileAId: string,
  profileBId: string,
  overrides: Partial<typeof nemesisPairings.$inferInsert> = {},
): Promise<string> {
  const [inserted] = await db
    .insert(nemesisPairings)
    .values(buildNemesisPairing(seasonId, profileAId, profileBId, { weekStart: '2026-07-06', status: 'completed', ...overrides }))
    .returning();
  return inserted!.id;
}

describe('requestRematch (§9.2 POST /rematch-requests)', () => {
  it('creates an open request against a past nemesis this season', async () => {
    const seasonId = await makeCurrentSeason();
    const [a, b] = await Promise.all([makeClaimedProfile(), makeClaimedProfile()]);
    await makeTerminalPairing(seasonId, a.id, b.id);

    const { request } = await requestRematch(db, a.id, b.id, NOW);
    expect(request.status).toBe('open');
    expect(request.requester_profile_id).toBe(a.id);
    expect(request.target_profile_id).toBe(b.id);
    expect(request.season_id).toBe(seasonId);
  });

  it('rejects a self-rematch', async () => {
    const a = await makeClaimedProfile();
    await expect(requestRematch(db, a.id, a.id, NOW)).rejects.toThrow(ApiError);
  });

  it('rejects a target who was never a nemesis this season', async () => {
    await makeCurrentSeason();
    const [a, b] = await Promise.all([makeClaimedProfile(), makeClaimedProfile()]);
    await expect(requestRematch(db, a.id, b.id, NOW)).rejects.toThrow(ApiError);
  });

  it('rejects a target who was a nemesis, but in an EARLIER season (not "this season")', async () => {
    const oldSeasonId = uuidv7();
    await db.insert(seasons).values({ id: oldSeasonId, kind: 'nemesis', startsOn: '2025-01-06', endsOn: '2025-03-30', name: 'Old season' });
    await makeCurrentSeason(); // the season covering NOW — no pairing in it
    const [a, b] = await Promise.all([makeClaimedProfile(), makeClaimedProfile()]);
    await makeTerminalPairing(oldSeasonId, a.id, b.id, { weekStart: '2025-01-06' });

    await expect(requestRematch(db, a.id, b.id, NOW)).rejects.toThrow(ApiError);
  });

  it('accepts a CANCELLED pairing as a valid "past nemesis" too, not just completed', async () => {
    const seasonId = await makeCurrentSeason();
    const [a, b] = await Promise.all([makeClaimedProfile(), makeClaimedProfile()]);
    await makeTerminalPairing(seasonId, a.id, b.id, { status: 'cancelled' });

    const { request } = await requestRematch(db, a.id, b.id, NOW);
    expect(request.status).toBe('open');
  });

  it('is idempotent — re-requesting while one is already open returns the same row', async () => {
    const seasonId = await makeCurrentSeason();
    const [a, b] = await Promise.all([makeClaimedProfile(), makeClaimedProfile()]);
    await makeTerminalPairing(seasonId, a.id, b.id);

    const first = await requestRematch(db, a.id, b.id, NOW);
    const second = await requestRematch(db, a.id, b.id, NOW);
    expect(second.request.id).toBe(first.request.id);

    const rows = await db.select().from(rematchRequests);
    expect(rows).toHaveLength(1);
  });

  it('notifies the target (nemesis_rematch_requested, email + push)', async () => {
    const seasonId = await makeCurrentSeason();
    const [a, b] = await Promise.all([makeClaimedProfile(), makeClaimedProfile()]);
    await makeTerminalPairing(seasonId, a.id, b.id);

    await requestRematch(db, a.id, b.id, NOW);

    const notifs = await db.select().from(notifications);
    expect(notifs).toHaveLength(2);
    expect(notifs.every((n) => n.kind === 'nemesis_rematch_requested')).toBe(true);
    expect(notifs.every((n) => n.profileId === b.id)).toBe(true);
    expect(new Set(notifs.map((n) => n.channel))).toEqual(new Set(['email', 'push']));
  });
});

describe('respondToRematchRequest (§9.2 POST /rematch-requests/:id/accept|decline)', () => {
  async function makeOpenRequest(seasonId: string, requesterId: string, targetId: string) {
    const { request } = await requestRematch(db, requesterId, targetId, NOW);
    return request.id;
  }

  it('lets the target accept, moving status to "accepted"', async () => {
    const seasonId = await makeCurrentSeason();
    const [a, b] = await Promise.all([makeClaimedProfile(), makeClaimedProfile()]);
    await makeTerminalPairing(seasonId, a.id, b.id);
    const id = await makeOpenRequest(seasonId, a.id, b.id);

    const { request } = await respondToRematchRequest(db, id, b.id, 'accept', NOW);
    expect(request.status).toBe('accepted');
  });

  it('lets the target decline, moving status to "declined"', async () => {
    const seasonId = await makeCurrentSeason();
    const [a, b] = await Promise.all([makeClaimedProfile(), makeClaimedProfile()]);
    await makeTerminalPairing(seasonId, a.id, b.id);
    const id = await makeOpenRequest(seasonId, a.id, b.id);

    const { request } = await respondToRematchRequest(db, id, b.id, 'decline', NOW);
    expect(request.status).toBe('declined');
  });

  it('rejects the requester trying to self-accept', async () => {
    const seasonId = await makeCurrentSeason();
    const [a, b] = await Promise.all([makeClaimedProfile(), makeClaimedProfile()]);
    await makeTerminalPairing(seasonId, a.id, b.id);
    const id = await makeOpenRequest(seasonId, a.id, b.id);

    await expect(respondToRematchRequest(db, id, a.id, 'accept', NOW)).rejects.toThrow(ApiError);
  });

  it('rejects a non-participant', async () => {
    const seasonId = await makeCurrentSeason();
    const [a, b, c] = await Promise.all([makeClaimedProfile(), makeClaimedProfile(), makeClaimedProfile()]);
    await makeTerminalPairing(seasonId, a.id, b.id);
    const id = await makeOpenRequest(seasonId, a.id, b.id);

    await expect(respondToRematchRequest(db, id, c.id, 'accept', NOW)).rejects.toThrow(ApiError);
  });

  it('rejects acting on an already-resolved request', async () => {
    const seasonId = await makeCurrentSeason();
    const [a, b] = await Promise.all([makeClaimedProfile(), makeClaimedProfile()]);
    await makeTerminalPairing(seasonId, a.id, b.id);
    const id = await makeOpenRequest(seasonId, a.id, b.id);

    await respondToRematchRequest(db, id, b.id, 'accept', NOW);
    await expect(respondToRematchRequest(db, id, b.id, 'accept', NOW)).rejects.toThrow(ApiError);
  });

  it('rejects an unknown request id', async () => {
    const b = await makeClaimedProfile();
    await expect(respondToRematchRequest(db, uuidv7(), b.id, 'accept', NOW)).rejects.toThrow(ApiError);
  });

  it('notifies the requester on accept/decline (nemesis_rematch_accepted / _declined)', async () => {
    const seasonId = await makeCurrentSeason();
    const [a, b] = await Promise.all([makeClaimedProfile(), makeClaimedProfile()]);
    await makeTerminalPairing(seasonId, a.id, b.id);
    const id = await makeOpenRequest(seasonId, a.id, b.id);

    await respondToRematchRequest(db, id, b.id, 'accept', NOW);

    const notifs = await db.select().from(notifications).where(sql`kind = 'nemesis_rematch_accepted'`);
    expect(notifs).toHaveLength(2);
    expect(notifs.every((n) => n.profileId === a.id)).toBe(true);
  });
});

describe('getNemesisHistoryPage rematch_request folding (WS5-T5 contract-change)', () => {
  it('is null when no rematch request exists between the viewer and the opponent', async () => {
    const seasonId = await makeCurrentSeason();
    const [a, b] = await Promise.all([makeClaimedProfile(), makeClaimedProfile()]);
    await makeTerminalPairing(seasonId, a.id, b.id);

    const page = await getNemesisHistoryPage(db, a.id, {});
    expect(page.data[0]!.rematch_request).toBeNull();
  });

  it('reports an outgoing open request from the viewer\'s point of view', async () => {
    const seasonId = await makeCurrentSeason();
    const [a, b] = await Promise.all([makeClaimedProfile(), makeClaimedProfile()]);
    await makeTerminalPairing(seasonId, a.id, b.id);
    await requestRematch(db, a.id, b.id, NOW);

    const page = await getNemesisHistoryPage(db, a.id, {});
    expect(page.data[0]!.rematch_request).toMatchObject({ direction: 'outgoing', status: 'open' });
  });

  it('reports the SAME request as incoming from the opponent\'s point of view', async () => {
    const seasonId = await makeCurrentSeason();
    const [a, b] = await Promise.all([makeClaimedProfile(), makeClaimedProfile()]);
    await makeTerminalPairing(seasonId, a.id, b.id);
    await requestRematch(db, a.id, b.id, NOW);

    const page = await getNemesisHistoryPage(db, b.id, {});
    expect(page.data[0]!.rematch_request).toMatchObject({ direction: 'incoming', status: 'open' });
  });

  it('prefers an open request over a resolved one when both exist for the same opponent', async () => {
    const seasonId = await makeCurrentSeason();
    const [a, b] = await Promise.all([makeClaimedProfile(), makeClaimedProfile()]);
    // Two terminal pairings this season between the same pair (e.g. an earlier rematch already
    // played out) — history has 2 rows, but rematch_request should be identical (opponent-keyed)
    // and prefer the newer OPEN request over the older declined one.
    await makeTerminalPairing(seasonId, a.id, b.id, { weekStart: '2026-07-06' });
    const declinedId = await (async () => {
      const { request } = await requestRematch(db, a.id, b.id, NOW);
      await respondToRematchRequest(db, request.id, b.id, 'decline', NOW);
      return request.id;
    })();
    const { request: openRequest } = await requestRematch(db, a.id, b.id, NOW);
    expect(openRequest.id).not.toBe(declinedId);

    const page = await getNemesisHistoryPage(db, a.id, {});
    expect(page.data[0]!.rematch_request).toMatchObject({ id: openRequest.id, status: 'open' });
  });
});

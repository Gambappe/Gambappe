/**
 * WS26-T11 golden loop (docs/plans/cpu-nemesis-wbs.md): one solo human, end to end through
 * the REAL jobs — nemesis:assign CPU-fills → cpu:pick sweeps (picking the daily, SKIPPING a
 * dead-even bonus) → question:lock → settlement:poll + grade:followup settle both → and
 * nemesis:conclude writes a verdict against the badged CPU.
 *
 * CPU-skip verdict semantics pinned here (the WBS's open AC): a skipped question is a normal
 * solo-pick day under §8.8 scoring — the human scores it ONLY by picking and winning, never
 * by forfeit, and the question is NOT excluded from the week. Final score is 1–1 (CPU wins
 * the daily, human wins the skipped-by-CPU bonus), with the human taking the verdict on the
 * §8.8 Σedge tiebreak (+0.5 from a 0.50 entry win vs the CPU's +0.38 from a 0.62 entry win).
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { uuidv7 } from 'uuidv7';
import { Redis } from 'ioredis';
import PgBoss from 'pg-boss';
import type pg from 'pg';
import { etDateString, isoWeekMonday, NEMESIS_MIN_PICKS } from '@receipts/core';
import {
  connect,
  fingerprints,
  markets,
  nemesisPairings,
  pairingQuestions,
  picks,
  placePickTx,
  profiles,
  questions,
  ratings,
  seedCpuRoster,
  type Db,
} from '@receipts/db';
import { buildMarket, buildPick, buildProfile, buildQuestion } from '@receipts/db/testing';
import { MockVenueAdapter } from '@receipts/venues/mock';
import { runNemesisAssign } from '../../src/jobs/nemesis-assign.js';
import { runCpuPickSweep } from '../../src/jobs/cpu-pick.js';
import { runQuestionLock } from '../../src/jobs/question-lock.js';
import { runSettlementPoll } from '../../src/jobs/settlement-poll.js';
import { runGradeFollowup } from '../../src/jobs/grade-followup.js';
import { runNemesisConclude } from '../../src/jobs/nemesis-conclude.js';

const dbUrl =
  process.env.TEST_DATABASE_URL ?? 'postgres://receipts:receipts@localhost:5432/receipts_test';
const redisUrl = process.env.TEST_REDIS_URL ?? process.env.REDIS_URL ?? 'redis://localhost:6379';

let pool: pg.Pool;
let db: Db;
let redis: Redis;
let boss: PgBoss;
let revalidateServer: Server;
const prevEnv: Record<string, string | undefined> = {};

// Real wall-clock anchored: the sweep's worklist and placePickTx compare lock_at against the
// DB's own now(), so fixtures must sit in the real present. Assign/conclude/settle take `at`.
const NOW = new Date();
const TODAY = etDateString(NOW);
const WEEK_START = isoWeekMonday(TODAY);

beforeAll(async () => {
  process.env.FLAG_NEMESIS = 'true';
  process.env.FLAG_CPU_NEMESIS = 'true';
  ({ pool, db } = connect({ connectionString: dbUrl }));
  await db.execute(sql`DROP SCHEMA public CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  await db.execute(sql`DROP SCHEMA IF EXISTS pgboss CASCADE`);
  await migrate(db, {
    migrationsFolder: join(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      '..',
      '..',
      'packages',
      'db',
      'drizzle',
    ),
  });

  redis = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
  await redis.flushdb();

  boss = new PgBoss({ connectionString: dbUrl, schema: 'pgboss' });
  await boss.start();
  for (const q of ['question:open', 'question:lock', 'reveal:fire', 'grade:followup']) {
    await boss.createQueue(q);
  }

  // Stub the web ISR revalidate endpoint so settle's revalidation POST lands somewhere real.
  revalidateServer = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: { rejected: [] } }));
  });
  await new Promise<void>((resolve) => revalidateServer.listen(0, '127.0.0.1', resolve));
  const addr = revalidateServer.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  prevEnv['NEXT_PUBLIC_APP_URL'] = process.env.NEXT_PUBLIC_APP_URL;
  prevEnv['INTERNAL_API_SECRET'] = process.env.INTERNAL_API_SECRET;
  process.env.NEXT_PUBLIC_APP_URL = `http://127.0.0.1:${port}`;
  process.env.INTERNAL_API_SECRET = 'test-internal-secret';
});

afterAll(async () => {
  delete process.env.FLAG_NEMESIS;
  delete process.env.FLAG_CPU_NEMESIS;
  process.env.NEXT_PUBLIC_APP_URL = prevEnv['NEXT_PUBLIC_APP_URL'];
  process.env.INTERNAL_API_SECRET = prevEnv['INTERNAL_API_SECRET'];
  await new Promise<void>((resolve) => revalidateServer.close(() => resolve()));
  await boss.stop({ graceful: false });
  await pool.end();
  redis.disconnect();
});

/** Eligible solo human: claimed + rating + fingerprint + NEMESIS_MIN_PICKS graded picks. */
async function makeSoloHuman(): Promise<string> {
  const row = buildProfile({ kind: 'claimed', status: 'active' });
  const [human] = await db.insert(profiles).values(row).returning();
  await db.insert(ratings).values({ profileId: human!.id, glickoRating: 1500, glickoRd: 200 });
  await db.insert(fingerprints).values({
    profileId: human!.id,
    chalk: 0.1,
    contrarian: 0.1,
    timing: 0.1,
    categoryShares: { sports: 1 },
    computedAt: NOW,
  });
  for (let i = 0; i < NEMESIS_MIN_PICKS; i++) {
    const market = buildMarket({ status: 'resolved', outcome: 'yes' });
    await db.insert(markets).values(market);
    const question = buildQuestion(market.id, { status: 'revealed', outcome: 'yes' });
    await db.insert(questions).values(question);
    await db.insert(picks).values(
      buildPick(question.id, human!.id, {
        side: 'yes',
        result: 'win',
        edge: 0.5,
        gradedAt: NOW,
      }),
    );
  }
  return human!.id;
}

describe('WS26-T11 — the golden CPU loop', () => {
  it('assign → sweep (pick + skip) → lock → settle → conclude, verdict vs the CPU', async () => {
    const humanId = await makeSoloHuman();
    const roster = await seedCpuRoster(db, NOW);
    const cpuIds = new Set(Object.values(roster));

    // 1) Assign: pool of one → CPU-fill.
    const assignReport = await runNemesisAssign(db, boss, NOW);
    expect(assignReport.cpuPairingsCreated).toBe(1);
    const [pairing] = await db
      .select()
      .from(nemesisPairings)
      .where(
        sql`${nemesisPairings.profileAId} = ${humanId} OR ${nemesisPairings.profileBId} = ${humanId}`,
      );
    const cpuId = pairing!.profileAId === humanId ? pairing!.profileBId : pairing!.profileAId;
    expect(cpuIds.has(cpuId)).toBe(true);
    expect(pairing!.weekStart).toBe(WEEK_START);

    // 2) The week's daily (0.62 — a favorite for the chalk-side CPU) and a DEAD-EVEN bonus
    //    (0.50 — every persona skips it).
    const dailyMarket = buildMarket({
      venue: 'kalshi',
      venueMarketId: `GOLD-DAILY-${uuidv7()}`,
      yesPrice: 0.62,
      yesPriceUpdatedAt: NOW,
    });
    await db.insert(markets).values(dailyMarket);
    const daily = buildQuestion(dailyMarket.id, {
      kind: 'daily',
      status: 'open',
      questionDate: TODAY,
      lockAt: new Date(NOW.getTime() + 3600_000),
    });
    await db.insert(questions).values(daily);

    const bonusMarket = buildMarket({
      venue: 'kalshi',
      venueMarketId: `GOLD-BONUS-${uuidv7()}`,
      yesPrice: 0.5,
      yesPriceUpdatedAt: NOW,
    });
    await db.insert(markets).values(bonusMarket);
    const bonus = buildQuestion(bonusMarket.id, {
      kind: 'nemesis_bonus',
      status: 'open',
      questionDate: null,
      lockAt: new Date(NOW.getTime() + 3600_000),
    });
    await db.insert(questions).values(bonus);
    await db.insert(pairingQuestions).values({ pairingId: pairing!.id, questionId: bonus.id });

    // 3) The human picks ONLY the bonus (yes at 0.50) — the day the CPU will skip.
    const humanPick = await placePickTx(db, {
      id: uuidv7(),
      questionId: bonus.id,
      profileId: humanId,
      side: 'yes',
      yesPriceAtEntry: 0.5,
      priceStampedAt: NOW,
      pickedAt: NOW,
      source: 'web',
    });
    expect(humanPick.outcome).toBe('inserted');

    // 4) Sweep: the CPU picks the daily and SKIPS the dead-even bonus.
    const sweep = await runCpuPickSweep(db, redis, NOW);
    expect(sweep.picked).toBe(1);
    expect(sweep.skipped).toBe(1);
    const cpuPicks = await db.select().from(picks).where(eq(picks.profileId, cpuId));
    expect(cpuPicks).toHaveLength(1);
    expect(cpuPicks[0]!.questionId).toBe(daily.id);
    expect(cpuPicks[0]!.side).toBe('yes'); // the 0.62 favorite
    expect(cpuPicks[0]!.source).toBe('cpu');

    // 5) Lock both, then settle both through the real chain (poll grades, followup settles).
    const lockAt = new Date(NOW.getTime() + 3600_000);
    expect((await runQuestionLock(db, pool, redis, daily.id, lockAt)).locked).toBe(true);
    expect((await runQuestionLock(db, pool, redis, bonus.id, lockAt)).locked).toBe(true);

    const adapter = new MockVenueAdapter('kalshi');
    adapter.addMarket({ venueMarketId: dailyMarket.venueMarketId });
    adapter.addMarket({ venueMarketId: bonusMarket.venueMarketId });
    adapter.resolve(dailyMarket.venueMarketId, 'yes'); // CPU's yes wins
    adapter.resolve(bonusMarket.venueMarketId, 'yes'); // human's yes wins
    await db
      .update(markets)
      .set({ status: 'closed' })
      .where(sql`${markets.id} IN (${dailyMarket.id}, ${bonusMarket.id})`);

    const settleAt = new Date(NOW.getTime() + 7200_000);
    const poll = await runSettlementPoll(db, pool, boss, [adapter], settleAt);
    expect(poll.resolved).toBe(2);
    await runGradeFollowup(db, pool, redis, daily.id, settleAt);
    await runGradeFollowup(db, pool, redis, bonus.id, settleAt);

    const [dailyAfter] = await db.select().from(questions).where(eq(questions.id, daily.id));
    const [bonusAfter] = await db.select().from(questions).where(eq(questions.id, bonus.id));
    expect(dailyAfter!.status).toBe('revealed');
    expect(bonusAfter!.status).toBe('revealed');

    // 6) Conclude: 1–1 (CPU won the daily; the human won the bonus the CPU skipped — scored
    //    because they PICKED AND WON, never by forfeit), human takes the verdict on Σedge
    //    (+0.50 vs +0.38). The skipped question was counted, not excluded.
    const concludeAt = new Date(NOW.getTime() + 8 * 24 * 3600_000);
    const conclude = await runNemesisConclude(db, concludeAt);
    expect(conclude.concluded).toBe(1);

    const [done] = await db
      .select()
      .from(nemesisPairings)
      .where(eq(nemesisPairings.id, pairing!.id));
    expect(done!.status).toBe('completed');
    const [humanScore, cpuScore] =
      done!.profileAId === humanId ? [done!.scoreA, done!.scoreB] : [done!.scoreB, done!.scoreA];
    expect(humanScore).toBe(1);
    expect(cpuScore).toBe(1);
    expect(done!.winnerProfileId).toBe(humanId); // Σedge tiebreak
    expect(done!.verdict).not.toBeNull();
    expect(done!.ratingAppliedAt).toBeNull(); // ratings:weekly applies later (drift, T12)
  }, 30_000);
});

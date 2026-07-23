/**
 * WS26-T7 pin (docs/plans/cpu-nemesis-wbs.md): the crowd-at-lock snapshot excludes CPU
 * rivals. The mechanism is the existing `bot_score >= BOT_EXCLUDE_THRESHOLD` filter in
 * `lockQuestionTx` (§6.2) — a CPU is seeded at `bot_score=1.0`, so exclusion holds by
 * construction. This test pins that: if either the filter or the seeding convention
 * changes, the crowd a human sees would start counting house bots, and this fails.
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type pg from 'pg';
import { connect, type Db } from '../../src/client.js';
import { lockQuestionTx } from '../../src/repositories/questions.js';
import { markets, picks, profiles, questions } from '../../src/schema/index.js';
import { buildMarket, buildPick, buildProfile, buildQuestion } from '../../src/testing/index.js';

const url =
  process.env.TEST_DATABASE_URL ?? 'postgres://receipts:receipts@localhost:5432/receipts_test';

let pool: pg.Pool;
let db: Db;

beforeAll(async () => {
  ({ pool, db } = connect({ connectionString: url }));
  await db.execute(sql`DROP SCHEMA public CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  await migrate(db, {
    migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'drizzle'),
  });
});

afterAll(async () => {
  await pool.end();
});

describe('crowd-at-lock excludes CPU rivals (WS26-T7)', () => {
  it('counts only human picks in the lock snapshot', async () => {
    const humanYes = buildProfile();
    const humanNo = buildProfile();
    const cpu = buildProfile({ kind: 'cpu', botScore: 1.0 });
    await db.insert(profiles).values([humanYes, humanNo, cpu]);

    const market = buildMarket();
    await db.insert(markets).values(market);
    const question = buildQuestion(market.id, { status: 'open' });
    await db.insert(questions).values(question);

    await db
      .insert(picks)
      .values([
        buildPick(question.id, humanYes.id, { side: 'yes' }),
        buildPick(question.id, humanNo.id, { side: 'no' }),
        buildPick(question.id, cpu.id, { side: 'yes', source: 'cpu' }),
      ]);

    const result = await lockQuestionTx(db, question.id, new Date(), null);
    expect(result.locked).toBe(true);
    if (result.locked) {
      expect(result.crowdYesAtLock).toBe(1); // the CPU's yes is not part of the crowd
      expect(result.crowdNoAtLock).toBe(1);
    }
  });
});

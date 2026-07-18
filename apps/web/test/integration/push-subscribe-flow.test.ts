/**
 * WS9-T2 integration: `subscribePush`/`unsubscribePush` (the route's lib layer, §13.2) against
 * a real Postgres. Route-level auth/flag gating is thin wrapping tested by inspection, not
 * re-derived here — see other claimed-only routes' (`wallet-flow.ts`, `moderation.ts`) tests
 * for the same split.
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type pg from 'pg';
import { connect, listActivePushSubscriptionsForProfile, profiles, type Db } from '@receipts/db';
import { buildProfile } from '@receipts/db/testing';
import { subscribePush, unsubscribePush } from '@/lib/push/subscribe-flow';

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
    migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'packages', 'db', 'drizzle'),
  });
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE push_subscriptions, profiles RESTART IDENTITY CASCADE`);
});

async function makeClaimedProfile(): Promise<string> {
  const profile = buildProfile({ kind: 'claimed' });
  await db.insert(profiles).values(profile);
  return profile.id as string;
}

describe('subscribePush', () => {
  it('creates an active subscription for the profile', async () => {
    const profileId = await makeClaimedProfile();
    const result = await subscribePush(db, profileId, {
      endpoint: 'https://push.example/flow-1',
      keys: { p256dh: 'p', auth: 'a' },
    });
    expect(result).toEqual({ subscribed: true });

    const active = await listActivePushSubscriptionsForProfile(db, profileId);
    expect(active.map((s) => s.endpoint)).toEqual(['https://push.example/flow-1']);
  });
});

describe('unsubscribePush', () => {
  it('revokes an existing subscription', async () => {
    const profileId = await makeClaimedProfile();
    await subscribePush(db, profileId, { endpoint: 'https://push.example/flow-2', keys: { p256dh: 'p', auth: 'a' } });

    const result = await unsubscribePush(db, 'https://push.example/flow-2', new Date());
    expect(result).toEqual({ unsubscribed: true });

    const active = await listActivePushSubscriptionsForProfile(db, profileId);
    expect(active).toHaveLength(0);
  });

  it('is a no-op for an endpoint that was never subscribed', async () => {
    await expect(unsubscribePush(db, 'https://push.example/never', new Date())).resolves.toEqual({
      unsubscribed: true,
    });
  });
});

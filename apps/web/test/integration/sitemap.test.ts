/**
 * WS8-T4 integration: `app/sitemap.ts`'s query layer (`lib/sitemap.ts`) against real Postgres.
 * Covers the task's AC directly: "sitemap lists revealed questions + profiles" — including the
 * negative half (a non-revealed question, and a deleted profile, must NOT appear).
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type pg from 'pg';
import {
  connect,
  markets,
  profiles,
  questions,
  type Db,
} from '@receipts/db';
import { buildMarket, buildProfile, buildQuestion, insertGradedQuestionScenario } from '@receipts/db/testing';
import { buildProfileSitemapEntries, buildQuestionSitemapEntries, buildSitemapEntries } from '../../lib/sitemap';

const dbUrl =
  process.env.TEST_DATABASE_URL ?? 'postgres://receipts:receipts@localhost:5432/receipts_test';
const APP_ORIGIN = 'http://localhost:3000';

let pool: pg.Pool;
let db: Db;

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
  process.env.NEXT_PUBLIC_APP_URL = APP_ORIGIN;
});

afterAll(async () => {
  await pool.end();
});

describe('buildQuestionSitemapEntries', () => {
  it('includes a revealed question, excludes open/locked/voided ones', async () => {
    const { question: revealed } = await insertGradedQuestionScenario(db);

    const market = buildMarket();
    await db.insert(markets).values(market);
    const openQuestion = buildQuestion(market.id as string, { status: 'open' });
    const lockedQuestion = buildQuestion(market.id as string, { status: 'locked' });
    const voidedQuestion = buildQuestion(market.id as string, {
      status: 'voided',
      voidReason: 'test void',
    });
    await db.insert(questions).values([openQuestion, lockedQuestion, voidedQuestion]);

    const entries = await buildQuestionSitemapEntries(db);
    const urls = entries.map((e) => e.url);

    expect(urls).toContain(`${APP_ORIGIN}/q/${revealed.slug}`);
    expect(urls).not.toContain(`${APP_ORIGIN}/q/${openQuestion.slug}`);
    expect(urls).not.toContain(`${APP_ORIGIN}/q/${lockedQuestion.slug}`);
    expect(urls).not.toContain(`${APP_ORIGIN}/q/${voidedQuestion.slug}`);
  });

  it('carries lastModified from the row', async () => {
    const { question } = await insertGradedQuestionScenario(db);
    const entries = await buildQuestionSitemapEntries(db);
    const entry = entries.find((e) => e.url === `${APP_ORIGIN}/q/${question.slug}`);
    expect(entry).toBeDefined();
    expect(entry!.lastModified).toBeInstanceOf(Date);
  });
});

describe('buildProfileSitemapEntries', () => {
  it('includes active/paused/suspended profiles, excludes deleted ones', async () => {
    const active = buildProfile({ status: 'active' });
    const paused = buildProfile({ status: 'paused_matchmaking' });
    const suspended = buildProfile({ status: 'suspended' });
    const deleted = buildProfile({ status: 'deleted' });
    await db.insert(profiles).values([active, paused, suspended, deleted]);

    const entries = await buildProfileSitemapEntries(db);
    const urls = entries.map((e) => e.url);

    expect(urls).toContain(`${APP_ORIGIN}/p/${active.slug}`);
    expect(urls).toContain(`${APP_ORIGIN}/p/${paused.slug}`);
    expect(urls).toContain(`${APP_ORIGIN}/p/${suspended.slug}`);
    expect(urls).not.toContain(`${APP_ORIGIN}/p/${deleted.slug}`);
  });

  it('includes ghost profiles too (matches /p/[slug]\'s own visibility rule)', async () => {
    const ghost = buildProfile({ kind: 'ghost', status: 'active' });
    await db.insert(profiles).values(ghost);
    const entries = await buildProfileSitemapEntries(db);
    expect(entries.map((e) => e.url)).toContain(`${APP_ORIGIN}/p/${ghost.slug}`);
  });
});

describe('buildSitemapEntries', () => {
  it('combines both question and profile entries', async () => {
    const { question } = await insertGradedQuestionScenario(db);
    const profile = buildProfile();
    await db.insert(profiles).values(profile);

    const entries = await buildSitemapEntries(db);
    const urls = entries.map((e) => e.url);
    expect(urls).toContain(`${APP_ORIGIN}/q/${question.slug}`);
    expect(urls).toContain(`${APP_ORIGIN}/p/${profile.slug}`);
  });
});

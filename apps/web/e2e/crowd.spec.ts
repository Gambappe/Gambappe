/**
 * WS22-T2 E2E · `/crowd` — the weekly boards (journeys-plan §5, D-J7). Two properties this task's
 * AC pins:
 *
 *  1. A seeded board renders: rank · handle → `/p/[slug]` · ACC · EDGE, with the ACC/EDGE legend.
 *     Seeding mirrors `test/integration/leaderboards.test.ts` (a claimed profile with 3 revealed
 *     wins in the live ISO week), inserted directly against the runner's DB like `shell-nav.spec.ts`.
 *  2. INV-10 (§10.2): `/crowd` is ISR and must be byte-identical with and without a ghost cookie —
 *     the returning ghost's `rcpt_gid` must never fragment the cache. This is the same proof shape
 *     as `spectator-cache-key.spec.ts`: the viewer-row highlight hydrates client-side from
 *     `GET /api/v1/me`, so it is absent from (and cannot vary) the server HTML.
 *
 * NOTE: not executable in this sandbox (no Playwright browser binaries / no network to install
 * them). Written against the existing e2e conventions (`shell-nav.spec.ts`, `spectator-cache-key.
 * spec.ts`); first real run is CI.
 */
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { addDaysToDateString, etDateString, isoWeekMonday, now } from '@receipts/core';
import { connect, markets, picks, profiles, questions, type Db } from '@receipts/db';
import { buildMarket, buildPick, buildProfile, buildQuestion } from '@receipts/db/testing';
import type pg from 'pg';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://receipts:receipts@localhost:5432/receipts';

let pool: pg.Pool;
let db: Db;

test.beforeAll(() => {
  ({ pool, db } = connect({ connectionString: DATABASE_URL }));
});

test.afterAll(async () => {
  await pool.end();
});

/** Seed one eligible claimed profile with 3 revealed wins in the CURRENT ISO week. */
async function seedBoardWinner(): Promise<{ handle: string; slug: string }> {
  const weekStart = isoWeekMonday(etDateString(now()));
  const claimed = buildProfile({
    kind: 'claimed',
    ghostSecretHash: null,
    handle: `Board-${randomUUID().slice(0, 8)}`,
    slug: `board-${randomUUID().slice(0, 8)}`,
  });
  await db.insert(profiles).values(claimed);
  for (let i = 0; i < 3; i++) {
    const market = buildMarket({ category: 'sports', venueMarketId: `KX-CROWD-${randomUUID()}` });
    await db.insert(markets).values(market);
    const q = buildQuestion(market.id as string, {
      slug: `crowd-${randomUUID().slice(0, 8)}`,
      questionDate: addDaysToDateString(weekStart, i),
      status: 'revealed',
    });
    await db.insert(questions).values(q);
    await db.insert(picks).values(buildPick(q.id as string, claimed.id as string, { result: 'win', edge: 0.4 }));
  }
  return { handle: claimed.handle as string, slug: claimed.slug as string };
}

test.describe('WS22-T2 /crowd — weekly boards (D-J7)', () => {
  test('renders a seeded board: handle links to /p/[slug], with the ACC/EDGE legend', async ({ page }) => {
    const { handle, slug } = await seedBoardWinner();

    await page.goto('/crowd');
    await expect(page.getByTestId('crowd-boards')).toBeVisible();
    // Overall is the default board and the seeded winner appears on it, linked to their profile.
    const handleLink = page.getByRole('link', { name: handle });
    await expect(handleLink).toBeVisible();
    await expect(handleLink).toHaveAttribute('href', `/p/${slug}`);
    // Footer legend (§5).
    await expect(page.getByText('ACC = calls right')).toBeVisible();
    await expect(page.getByText('EDGE = price beaten at entry')).toBeVisible();
  });

  test('overall + topic chips are present and switchable', async ({ page }) => {
    await seedBoardWinner();
    await page.goto('/crowd');
    await expect(page.getByTestId('crowd-chip-overall')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('crowd-chip-sports').click();
    await expect(page.getByTestId('crowd-chip-sports')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('crowd-chip-overall')).toHaveAttribute('aria-pressed', 'false');
  });

  test('INV-10: /crowd is byte-identical with and without a ghost cookie (§10.2)', async ({ request }) => {
    await seedBoardWinner();

    const withoutCookie = await request.get('/crowd', { headers: { cookie: '' } });
    const withCookie = await request.get('/crowd', {
      headers: { cookie: 'rcpt_gid=deadbeef-0000-0000-0000-000000000000' },
    });

    const [bodyWithout, bodyWith] = await Promise.all([withoutCookie.text(), withCookie.text()]);

    expect(withoutCookie.status()).toBe(withCookie.status());
    expect(bodyWithout).toBe(bodyWith);
    // The server HTML never carries the viewer highlight (it hydrates client-side) and never
    // echoes the cookie.
    expect(bodyWith).not.toContain('deadbeef-0000-0000-0000-000000000000');
    expect(bodyWith).not.toContain('crowd-row-me');
  });
});

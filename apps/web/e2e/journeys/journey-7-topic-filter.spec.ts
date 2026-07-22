/**
 * Home stack ↔ topic follows (D-J2 supply). The topic PICKER lives only on `/you` (keeping `/`
 * uncluttered); the home `/` deck reflects the viewer's follows without breaking its viewer-free
 * SSR (INV-10) by refetching `GET /api/v1/stack` once after hydration. This pins that contract:
 * `/` renders the deck but NO picker, and the follows-scoped refetch fires on load.
 *
 * Runs on the `journeys` project (swipe_ballot + topic_markets ON), so `/` renders the `StackDeck`.
 */
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { connectDb, seedTopicCard, type DbHandle } from './_journey-helpers';

let handle: DbHandle;

test.beforeAll(() => {
  handle = connectDb();
});

test.afterAll(async () => {
  await handle.pool.end();
});

test.describe('Home stack · reflects follows, no on-page picker (D-J2)', () => {
  test('/ deals the deck, refetches the follows-scoped stack on load, and shows NO topic picker', async ({
    page,
    context,
  }) => {
    test.setTimeout(45_000);
    await context.clearCookies();

    // Seed one open topic so `/`'s all-categories deck is non-empty regardless of what the other
    // journeys have pruned/seeded.
    await seedTopicCard(handle.db, `Journey 7 home card ${randomUUID().slice(0, 8)}`);

    // The post-hydration, follows-honoring refetch (StackDeck) must fire on load.
    const stackRefetch = page.waitForRequest(
      (r) => /\/api\/v1\/stack$/.test(r.url()) && r.method() === 'GET',
    );

    await page.goto('/');
    await expect(page.getByTestId('stack-deck')).toBeVisible();
    await expect(page.getByTestId('deck-progress')).toHaveText(/\d+ of \d+/i);

    await stackRefetch;

    // The topic picker is NOT on the home page — it lives on /you. And the deck stays decluttered.
    await expect(page.getByTestId('topic-follow-chips')).toHaveCount(0);
    await expect(page.getByTestId('rail-against')).toHaveCount(0);
    await expect(page.getByTestId('ballot-hints')).toHaveCount(0);
  });

  test('the topic picker IS on /you', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/you');
    await expect(page.getByTestId('topic-follow-chips')).toBeVisible();
  });
});

/**
 * WS8-T4 E2E: `GET /api/oembed` and `GET /sitemap.xml` against the real running app + real
 * Postgres (design doc §19.3 AC). Seeds directly into Postgres, same pattern as
 * `question-page.spec.ts` (`lib/question-view.ts`'s header explains why: real SSR reads the DB
 * directly, so a seeded row is what makes these pages/routes non-trivial to exercise).
 */
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { connect, markets, profiles, questions, type Db } from '@receipts/db';
import { buildMarket, buildProfile, buildQuestion } from '@receipts/db/testing';
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

async function seedRevealedQuestion() {
  const unique = randomUUID();
  const market = buildMarket({ venueMarketId: `KX-E2E-OEMBED-${unique}`, status: 'resolved', outcome: 'yes' });
  await db.insert(markets).values(market);
  const question = buildQuestion(market.id as string, {
    slug: `e2e-oembed-${unique}`,
    questionDate: null,
    status: 'revealed',
    outcome: 'yes',
    revealedAt: new Date(),
  });
  await db.insert(questions).values(question);
  return { market, question };
}

async function seedProfile() {
  const profile = buildProfile({ handle: `E2E Fox ${randomUUID().slice(0, 8)}` });
  await db.insert(profiles).values(profile);
  return profile;
}

test.describe('GET /api/oembed (§10.5)', () => {
  test('a real question resolves via the relative-path url= shape', async ({ request }) => {
    const { question } = await seedRevealedQuestion();
    const res = await request.get(`/api/oembed?url=${encodeURIComponent(`/q/${question.slug}`)}&format=json`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.type).toBe('rich');
    expect(body.title).toBe(question.headline);
  });

  test('a real profile resolves via the absolute-URL url= shape', async ({ request, baseURL }) => {
    // The matcher requires an https absolute scheme regardless of the app's own configured
    // scheme (`baseURL` is http:// in this e2e env) — only the host has to match.
    const profile = await seedProfile();
    const host = new URL(baseURL!).host;
    const pageUrl = `https://${host}/p/${profile.slug}`;
    const res = await request.get(`/api/oembed?url=${encodeURIComponent(pageUrl)}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.title).toBe(`${profile.handle}'s receipt`);
  });

  test('an unknown slug 404s', async ({ request }) => {
    const res = await request.get('/api/oembed?url=%2Fq%2Fdoes-not-exist');
    expect(res.status()).toBe(404);
  });

  test('SSRF: a foreign host 404s instead of being fetched', async ({ request }) => {
    const res = await request.get(
      `/api/oembed?url=${encodeURIComponent('https://evil.example/q/anything')}`,
    );
    expect(res.status()).toBe(404);
  });

  test('the discovery link on /q/[slug] round-trips into a working oEmbed response', async ({
    page,
    request,
  }) => {
    const { question } = await seedRevealedQuestion();
    await page.goto(`/q/${question.slug}`);
    const href = await page
      .locator('link[type="application/json+oembed"]')
      .getAttribute('href');
    expect(href).toBeTruthy();
    const res = await request.get(href!);
    expect(res.status()).toBe(200);
  });
});

test.describe('GET /sitemap.xml (§10.5)', () => {
  test('lists a revealed question and a profile', async ({ request }) => {
    const { question } = await seedRevealedQuestion();
    const profile = await seedProfile();

    const res = await request.get('/sitemap.xml');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('xml');
    const xml = await res.text();
    expect(xml).toContain(`/q/${question.slug}`);
    expect(xml).toContain(`/p/${profile.slug}`);
  });
});

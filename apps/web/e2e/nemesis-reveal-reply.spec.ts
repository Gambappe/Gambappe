import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { and, eq } from 'drizzle-orm';
import {
  connect,
  markets,
  nemesisPairings,
  pairingReactions,
  picks,
  profiles,
  questions,
  seasons,
  sessions,
  users,
  type Db,
} from '@receipts/db';
import { buildMarket, buildNemesisPairing, buildPick, buildProfile, buildQuestion, buildSeason, computeEdge } from '@receipts/db/testing';
import type pg from 'pg';

/**
 * design-diff audit (`docs/mockups/swipe-ux.html`'s daily nemesis reveal card carries an inline
 * "STAMP REPLY ▾" affordance that the shipped app had split off onto the separate `/nemesis` hub
 * page): the reply-from-the-reveal-card flow, driven against REAL `GET /questions/:slug/reveal`
 * and REAL `POST /api/v1/reactions` over really-seeded Postgres — matching `nemesis-flip.spec.ts`'s
 * (SW10-T1) binding rule ("every test of the trigger path must drive the real reveal endpoint
 * against really-seeded history") and `nemesis-reactions.spec.ts`'s (SW10-T4) binding rule for the
 * reaction round-trip itself. No `page.route` mocks of either endpoint anywhere in this file.
 *
 * `ReactionStampsPanel` only renders for a `claimed` participant (`canReact`, see its own header
 * comment) — unlike `nemesis-flip.spec.ts`'s ghost-cookie viewer, this file needs a REAL Auth.js
 * session on an already-`claimed` profile, seeded the same way `nemesis-reactions.spec.ts`'s
 * header comment justifies (a real `users` + `sessions` row, database-strategy session cookie —
 * no OAuth/magic-link round trip needed since the profile doesn't need to go THROUGH claim).
 *
 * `FLAG_NEMESIS` defaults to `'true'` for the whole e2e suite (`playwright.config.ts`).
 */

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://receipts:receipts@localhost:5432/receipts';

// See `nemesis-rematch.spec.ts`'s header comment on this exact constant — `next start` always
// runs with `NODE_ENV=production`, so `useSecureCookies` (`apps/web/auth.ts`) is always true here.
const SESSION_COOKIE_NAME = '__Secure-authjs.session-token';

let pool: pg.Pool;
let db: Db;

test.beforeAll(() => {
  ({ pool, db } = connect({ connectionString: DATABASE_URL }));
});

test.afterAll(async () => {
  await pool.end();
});

/** A random far-future UTC date — collision-proof under `fullyParallel: true` against one shared
 * Postgres, matching `nemesis-flip.spec.ts`'s own helper verbatim. */
function randomFutureDate(): string {
  const year = 2100 + Math.floor(Math.random() * 400);
  const month = Math.floor(Math.random() * 12);
  const day = 1 + Math.floor(Math.random() * 25);
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

async function seedClaimedProfileWithSession(handle: string): Promise<{ profileId: string; sessionToken: string }> {
  const userId = randomUUID();
  const email = `nemesis-reveal-reply-${randomUUID()}@example.test`;
  await db.insert(users).values({ id: userId, email, ageAttestedAt: new Date() });

  const [profile] = await db
    .insert(profiles)
    .values(buildProfile({ kind: 'claimed', status: 'active', userId, handle }))
    .returning();

  const sessionToken = randomUUID();
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ sessionToken, userId, expires });

  return { profileId: profile!.id as string, sessionToken };
}

/** Seeds an active pairing, plus a real revealed daily question both sides have picked — the
 * exact shape `computeNemesisFlipBlock` needs to populate `nemesis_flip` (mirrors
 * `nemesis-flip.spec.ts`'s own seeding, minus that file's ghost-cookie viewer). */
async function seedRevealedPairingQuestion(
  viewerId: string,
  opponentId: string,
  unique: string,
): Promise<{ slug: string; questionDate: string }> {
  const questionDate = randomFutureDate();
  const [season] = await db.insert(seasons).values(buildSeason({ startsOn: questionDate, endsOn: '2500-12-31' })).returning();
  await db.insert(nemesisPairings).values(
    buildNemesisPairing(season!.id, viewerId, opponentId, {
      weekStart: questionDate,
      status: 'active',
      scoreA: 0,
      scoreB: 0,
    }),
  );

  const market = buildMarket({ status: 'resolved', outcome: 'yes', venueMarketId: `KX-NEMESIS-REPLY-${randomUUID()}` });
  await db.insert(markets).values(market);
  const revealedAt = new Date();
  const question = buildQuestion(market.id as string, {
    questionDate,
    slug: `nemesis-reveal-reply-${unique}`,
    status: 'revealed',
    outcome: 'yes',
    yesLabel: 'Yes it will',
    noLabel: 'No it will not',
    // Same real-past-lock forcing `nemesis-flip.spec.ts` needs — §9.3 masking reads real
    // wall-clock `lock_at`, not `question_date` (a far-future collision-proofing fixture here).
    lockAt: new Date(Date.now() - 3600_000),
    crowdYesAtLock: 6,
    crowdNoAtLock: 4,
    settledAt: revealedAt,
    revealedAt,
  });
  await db.insert(questions).values(question);

  await db.insert(picks).values([
    buildPick(question.id as string, viewerId, {
      side: 'yes',
      yesPriceAtEntry: 0.6,
      result: 'win',
      edge: computeEdge('yes', 0.6, true),
      gradedAt: revealedAt,
    }),
    buildPick(question.id as string, opponentId, {
      side: 'no',
      yesPriceAtEntry: 0.7,
      result: 'loss',
      edge: computeEdge('no', 0.7, false),
      gradedAt: revealedAt,
    }),
  ]);

  return { slug: question.slug as string, questionDate };
}

test.describe('inline reply on the daily nemesis reveal card (design-diff audit: mockup\'s "STAMP REPLY ▾")', () => {
  test("a claimed participant can reply with a stamp straight off the reveal card, and it round-trips through a real page reload", async ({
    page,
    context,
  }) => {
    test.setTimeout(30_000);
    const unique = randomUUID();

    const { profileId: viewerId, sessionToken } = await seedClaimedProfileWithSession(`Reveal Reactor ${unique}`);
    const [opponent] = await db
      .insert(profiles)
      .values(buildProfile({ kind: 'claimed', status: 'active', handle: `Reveal Opponent ${unique}` }))
      .returning();
    const opponentId = opponent!.id as string;

    const { slug } = await seedRevealedPairingQuestion(viewerId, opponentId, unique);

    await context.addCookies([
      {
        name: SESSION_COOKIE_NAME,
        value: sessionToken,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
      },
    ]);

    // The trigger: a real browser navigation to the question page. No `page.route` mock of
    // either the reveal endpoint or the reactions endpoint anywhere in this test.
    await page.goto(`/q/${slug}`);
    await expect(page.getByTestId('reveal-sequence-result')).toBeVisible();

    // The reveal card itself, unchanged.
    const flip = page.getByTestId('nemesis-flip');
    await expect(flip).toBeVisible();
    await expect(flip).toContainText(opponent!.handle as string);

    // The new inline reply affordance, mounted alongside it on the SAME card — reusing
    // `ReactionStampsPanel` (same testid `NemesisMatchupCard` on `/nemesis` already renders).
    const panel = page.getByTestId('reaction-stamps-panel');
    await expect(panel).toBeVisible();

    const luckyButton = panel.getByTestId('reaction-Lucky');
    await expect(luckyButton).toHaveAttribute('aria-pressed', 'false');
    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/v1/reactions') && res.request().method() === 'POST'),
      luckyButton.click(),
    ]);
    await expect(luckyButton).toHaveAttribute('aria-pressed', 'true');

    // The real, persisted effect.
    const [row] = await db.select().from(pairingReactions).where(eq(pairingReactions.profileId, viewerId));
    expect(row?.emoji).toBe('Lucky');

    // A REAL navigation (not a client-side re-render): the reveal payload's own
    // `nemesis_flip.today_stamps` (server-derived) must reflect the post too, independent of the
    // panel's client-side optimistic state, and independent of `/nemesis`'s own read path.
    await page.reload();
    await expect(page.getByTestId('reveal-sequence-result')).toBeVisible();
    await expect(page.getByTestId('reaction-stamps-panel').getByTestId('reaction-Lucky')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('a spectator (no session, no viewer block at all) sees neither the flip card nor the reply picker — no leak', async ({
    page,
  }) => {
    test.setTimeout(30_000);
    const unique = randomUUID();

    // Two claimed profiles form the real pairing/question data, but the BROWSER never
    // authenticates as either — no cookie of any kind is set.
    const [viewer, opponent] = await db
      .insert(profiles)
      .values([
        buildProfile({ kind: 'claimed', status: 'active', handle: `Spectator Viewer ${unique}` }),
        buildProfile({ kind: 'claimed', status: 'active', handle: `Spectator Opponent ${unique}` }),
      ])
      .returning();

    const { slug } = await seedRevealedPairingQuestion(viewer!.id as string, opponent!.id as string, unique);
    const [pairingRow] = await db
      .select()
      .from(nemesisPairings)
      .where(and(eq(nemesisPairings.profileAId, viewer!.id as string), eq(nemesisPairings.profileBId, opponent!.id as string)));

    await page.goto(`/q/${slug}`);
    // A spectator has no `viewer` block at all — the reveal sequence degrades to the no-pick
    // state, and NEITHER the flip card NOR the reply picker can render (both live inside
    // `viewer.nemesis_flip`, unreachable without a viewer block in the first place).
    await expect(page.getByTestId('reveal-sequence-no-pick')).toBeVisible();
    await expect(page.getByTestId('nemesis-flip')).toHaveCount(0);
    await expect(page.getByTestId('reaction-stamps-panel')).toHaveCount(0);

    // Sanity: the pairing really was seeded (guards against a false pass from a seeding bug).
    expect(pairingRow).toBeTruthy();
  });
});

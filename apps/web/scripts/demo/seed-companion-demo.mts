/**
 * Demo world for the xTrace/Claude companion hackathon surfaces (XH-T9,
 * docs/xtrace-hackathon-tasks.md). Extends the screenshot-tour seeding pattern
 * (`apps/web/scripts/screenshot-tour/seed-fixtures.mts` is the template): two claimed rivals,
 * three CONCLUDED nemesis weeks between them (alternating winners, the last a rematch), one
 * currently-active week, and pairing-thread trash talk — everything the companion:ingest job,
 * the banter/callout-draft routes, and the companion:season-recap job need to have something
 * worth reading. See docs/xtrace-hackathon-demo.md for the full run sequence.
 *
 * This script seeds Postgres ONLY — it never calls xTrace or Claude itself. That's the demo:
 * run the real jobs/routes against this world with real keys (the runbook).
 *
 * Idempotent: re-running prints the existing world's ids and exits 0 rather than inserting a
 * second copy (mirrors seed-fixtures.mts's sentinel-row early-exit; this is NOT an upsert).
 */
import { eq, or } from 'drizzle-orm';
import { connect, nemesisPairings, posts, profiles, seasons } from '@receipts/db';
import { buildNemesisPairing, buildProfile, buildSeason } from '@receipts/db/testing';
import {
  addDaysToDateString,
  etDateString,
  isoWeekMonday,
  now,
  slugifyHandle,
  NEMESIS_SEASON_WEEKS,
} from '@receipts/core';
import { uuidv7 } from 'uuidv7';

const { pool, db } = connect();

const CHALK_HANDLE = 'chalk_daddy';
const FADE_HANDLE = 'fade_the_public';

interface VerdictNarration {
  scoreA: number;
  scoreB: number;
  edgeA: number;
  edgeB: number;
  winner: 'a' | 'b' | 'draw';
  excludedQuestionIds: string[];
  narration: Record<string, { line: string; emphasis: string | null }>;
}

/** Exactly the shape `nemesis:conclude` writes (apps/worker/src/jobs/nemesis-conclude.ts) — T6/T8
 * read `verdict.narration[profileId]?.line` via optional chaining, so a plausible-but-wrong shape
 * here would degrade silently to empty verdict lines instead of erroring. */
function buildVerdict(
  aId: string,
  bId: string,
  scoreA: number,
  scoreB: number,
  winner: 'a' | 'b' | 'draw',
  lineA: string,
  lineB: string,
): VerdictNarration {
  return {
    scoreA,
    scoreB,
    edgeA: winner === 'a' ? 0.42 : winner === 'b' ? 0.08 : 0.2,
    edgeB: winner === 'b' ? 0.42 : winner === 'a' ? 0.08 : 0.2,
    winner,
    excludedQuestionIds: [],
    narration: {
      [aId]: { line: lineA, emphasis: null },
      [bId]: { line: lineB, emphasis: null },
    },
  };
}

function post(pairingId: string, profileId: string, body: string, at: Date) {
  return {
    id: uuidv7(),
    contextKind: 'pairing' as const,
    contextId: pairingId,
    profileId,
    body,
    status: 'visible' as const,
    createdAt: at,
    updatedAt: at,
  };
}

try {
  const chalkSlug = slugifyHandle(CHALK_HANDLE);

  // Idempotency: a prior run's sentinel profile, by fixed slug.
  const [existingChalk] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.slug, chalkSlug))
    .limit(1);
  if (existingChalk) {
    const existingFade = (
      await db
        .select()
        .from(profiles)
        .where(eq(profiles.slug, slugifyHandle(FADE_HANDLE)))
        .limit(1)
    )[0];
    const [existingPairing] = await db
      .select({ seasonId: nemesisPairings.seasonId })
      .from(nemesisPairings)
      .where(
        or(
          eq(nemesisPairings.profileAId, existingChalk.id),
          eq(nemesisPairings.profileBId, existingChalk.id),
        ),
      )
      .limit(1);
    console.log(
      JSON.stringify(
        {
          alreadySeeded: true,
          chalkProfileId: existingChalk.id,
          chalkHandle: existingChalk.handle,
          fadeProfileId: existingFade?.id ?? null,
          fadeHandle: existingFade?.handle ?? null,
          seasonId: existingPairing?.seasonId ?? null,
        },
        null,
        1,
      ),
    );
    process.exit(0);
  }

  // --- Profiles --------------------------------------------------------------------------------
  const chalk = buildProfile({ kind: 'claimed', handle: CHALK_HANDLE, slug: chalkSlug });
  const fade = buildProfile({
    kind: 'claimed',
    handle: FADE_HANDLE,
    slug: slugifyHandle(FADE_HANDLE),
  });
  await db.insert(profiles).values([chalk, fade]);

  // Canonical profile_a/profile_b order (id ASC), same convention every pairing-producing task
  // in this repo follows (§5.5) — NOT tied to which handle is "chalk" vs "fade".
  const sortedPair = [chalk, fade].sort((x, y) => String(x.id).localeCompare(String(y.id)));
  const a = sortedPair[0]!;
  const b = sortedPair[1]!;
  const aId = a.id as string;
  const bId = b.id as string;
  const aHandle = a.handle;
  const bHandle = b.handle;

  // --- Season: 3 weeks already played, still running (T8's "latest ended season" default would
  // find nothing — the runbook passes this printed seasonId explicitly) ------------------------
  const thisWeekMonday = isoWeekMonday(etDateString(now()));
  const week1 = addDaysToDateString(thisWeekMonday, -3 * 7);
  const week2 = addDaysToDateString(thisWeekMonday, -2 * 7);
  const week3 = addDaysToDateString(thisWeekMonday, -1 * 7);
  const seasonStartsOn = week1;
  const seasonEndsOn = addDaysToDateString(seasonStartsOn, NEMESIS_SEASON_WEEKS * 7 - 1);

  const season = buildSeason({
    startsOn: seasonStartsOn,
    endsOn: seasonEndsOn,
    name: `Companion Demo Season (${seasonStartsOn})`,
  });
  await db.insert(seasons).values(season);
  const seasonId = season.id as string;

  // --- 3 concluded pairings, alternating winners, the last a rematch --------------------------
  const verdict1 = buildVerdict(
    aId,
    bId,
    3,
    1,
    'a',
    `${aHandle} chalked it up 3-1 — never fade the favorite.`,
    `${bHandle}: cold week. ${aHandle} played it safe and it worked.`,
  );
  const verdict2 = buildVerdict(
    aId,
    bId,
    1,
    4,
    'b',
    `${aHandle}: got run over. Adjusting for next time.`,
    `${bHandle} faded the public AND ${aHandle} — 4-1, book it.`,
  );
  const verdict3 = buildVerdict(
    aId,
    bId,
    3,
    2,
    'a',
    `${aHandle} takes the rematch 3-2 — chalk wins again.`,
    `${bHandle}: close one. Running it back was the right call, just came up short.`,
  );

  const pairing1 = buildNemesisPairing(seasonId, aId, bId, {
    weekStart: week1,
    status: 'completed',
    scoreA: verdict1.scoreA,
    scoreB: verdict1.scoreB,
    edgeA: verdict1.edgeA,
    edgeB: verdict1.edgeB,
    winnerProfileId: aId,
    verdict: verdict1,
    isRematch: false,
  });
  const pairing2 = buildNemesisPairing(seasonId, aId, bId, {
    weekStart: week2,
    status: 'completed',
    scoreA: verdict2.scoreA,
    scoreB: verdict2.scoreB,
    edgeA: verdict2.edgeA,
    edgeB: verdict2.edgeB,
    winnerProfileId: bId,
    verdict: verdict2,
    isRematch: false,
  });
  const pairing3 = buildNemesisPairing(seasonId, aId, bId, {
    weekStart: week3,
    status: 'completed',
    scoreA: verdict3.scoreA,
    scoreB: verdict3.scoreB,
    edgeA: verdict3.edgeA,
    edgeB: verdict3.edgeB,
    winnerProfileId: aId,
    verdict: verdict3,
    isRematch: true,
  });

  // --- 1 currently-active pairing this week ---------------------------------------------------
  const activePairing = buildNemesisPairing(seasonId, aId, bId, {
    weekStart: thisWeekMonday,
    status: 'active',
    scoreA: 0,
    scoreB: 0,
    edgeA: 0,
    edgeB: 0,
    winnerProfileId: null,
    verdict: null,
    isRematch: false,
  });

  await db.insert(nemesisPairings).values([pairing1, pairing2, pairing3, activePairing]);

  // --- 9 pairing-thread posts, distinctly quotable, spread across the 3 concluded weeks -------
  const day = 86_400_000;
  const w1At = new Date(`${week1}T18:00:00Z`);
  const w2At = new Date(`${week2}T18:00:00Z`);
  const w3At = new Date(`${week3}T18:00:00Z`);
  const postRows = [
    post(pairing1.id as string, aId, 'chalk never fades. write it down.', new Date(w1At.getTime())),
    post(
      pairing1.id as string,
      bId,
      "one week doesn't make you smart, it makes you lucky.",
      new Date(w1At.getTime() + day),
    ),
    post(
      pairing1.id as string,
      aId,
      "lucky is a full week of 3-1's. see you next week.",
      new Date(w1At.getTime() + 2 * day),
    ),
    post(
      pairing2.id as string,
      bId,
      'faded the public AND you in the same week. two for one.',
      new Date(w2At.getTime()),
    ),
    post(
      pairing2.id as string,
      aId,
      'noted. running it back next week, same stakes-free terms.',
      new Date(w2At.getTime() + day),
    ),
    post(
      pairing2.id as string,
      bId,
      'stakes-free is the only way you can afford to talk this much.',
      new Date(w2At.getTime() + 2 * day),
    ),
    post(
      pairing3.id as string,
      aId,
      'rematch requested, rematch handled. 3-2. chalk city.',
      new Date(w3At.getTime()),
    ),
    post(
      pairing3.id as string,
      bId,
      "close. i'll take a moral W and a real rematch next season.",
      new Date(w3At.getTime() + day),
    ),
    post(activePairing.id as string, aId, 'week four. same read, same result incoming.', now()),
  ];
  await db.insert(posts).values(postRows);

  console.log(
    JSON.stringify(
      {
        alreadySeeded: false,
        chalkProfileId: chalk.id,
        chalkHandle: chalk.handle,
        chalkSlug: chalk.slug,
        fadeProfileId: fade.id,
        fadeHandle: fade.handle,
        fadeSlug: fade.slug,
        seasonId,
        pairingIds: {
          week1: pairing1.id,
          week2: pairing2.id,
          week3: pairing3.id,
          active: activePairing.id,
        },
      },
      null,
      1,
    ),
  );
} finally {
  await pool.end();
}

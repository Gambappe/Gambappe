/**
 * Throwaway: print the EXACT prompts the companion surfaces would send, built from real DB
 * records and a real xTrace search over the new episode-aware retrieval path. Generation is
 * deliberately not performed here — this dumps the input so a completion can be produced and
 * judged against the true prompt rather than a paraphrase of it.
 */
import { buildBanterPrompt, buildCalloutDraftPrompt, buildRecapPrompt, xtraceClientFromEnv } from '@receipts/companion';
import { COMPANION_SEARCH_LIMIT } from '@receipts/core';
import { connect, lifetimeRecordBetween, getProfileById } from '@receipts/db';

const CHALK = '019f9144-53c0-7e01-987a-304f5ef54e79';
const FADE = '019f9144-53c0-7e01-987a-305079a10fa9';

const { pool, db } = connect();
const xtrace = xtraceClientFromEnv();

const [chalk, fade] = await Promise.all([getProfileById(db, CHALK), getProfileById(db, FADE)]);
const chalkHandle = chalk?.handle ?? 'chalk_daddy';
const fadeHandle = fade?.handle ?? 'fade_the_public';
const record = await lifetimeRecordBetween(db, CHALK, FADE);

async function memoryFor(viewerId: string, query: string, episodeSlots: number): Promise<string[]> {
  if (!xtrace) return [];
  const rows = await xtrace.search({ query, userId: viewerId, include: ['fact', 'episode'], episodeSlots });
  return rows.slice(0, COMPANION_SEARCH_LIMIT).map((m) => `${m.text}`);
}

const banterMem = await memoryFor(CHALK, `${fadeHandle} rivalry banter grudges history`, 2);
const draftMem = await memoryFor(CHALK, `${fadeHandle} rivalry trash talk grudges history`, 2);
const recapMem = await memoryFor(CHALK, 'season rivalry highlights grudges', 3);

console.log(`# memory counts: banter=${banterMem.length} draft=${draftMem.length} recap=${recapMem.length}\n`);

const banter = buildBanterPrompt({
  viewerHandle: chalkHandle,
  opponentHandle: fadeHandle,
  record,
  currentWeek: { scoreViewer: 0, scoreOpponent: 0, daysRemaining: 3 },
  lastVerdictLine: `${chalkHandle} took the rematch 3-2.`,
  memory: banterMem,
});

const draft = buildCalloutDraftPrompt({
  challengerHandle: chalkHandle,
  targetHandle: fadeHandle,
  record,
  memory: draftMem,
});

const recap = buildRecapPrompt({
  handle: chalkHandle,
  seasonName: 'Companion Demo Season',
  stats: { pairings: 3, wins: 2, losses: 1, draws: 0, bestStreak: 1, calloutsSent: 0, calloutsWon: 0 },
  verdictLines: [
    `${chalkHandle} took it 3-1.`,
    `${fadeHandle} ran it back 4-1.`,
    `${chalkHandle} took the rematch 3-2.`,
  ],
  memory: recapMem,
});

for (const [name, p] of [['BANTER', banter], ['CALLOUT DRAFT', draft], ['SEASON RECAP', recap]] as const) {
  console.log(`\n${'='.repeat(90)}\n===== ${name}\n${'='.repeat(90)}`);
  console.log('--- SYSTEM ---');
  console.log(p.system);
  console.log('\n--- USER ---');
  console.log(p.user);
}

await pool.end();

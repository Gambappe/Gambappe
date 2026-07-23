/**
 * xTrace vs Postgres-FTS retrieval stress test (scratch harness, not part of any workstream).
 *
 * Question under test: does xTrace's semantic search + server-side fact extraction beat a
 * "normal db" baseline (websearch_to_tsquery + ts_rank over the same raw messages)?
 *
 * Design:
 *   - A noisy ~160-message rivalry-thread corpus with 10 hand-authored planted facts and a
 *     ground-truth answer key. Filler is realistic chatter (refs, food, memes) plus a few
 *     deliberate lexical distractors ("rematch on TV tonight").
 *   - Same corpus ingested into BOTH systems; same top-k (5) retrieved from both.
 *   - 10 queries in 3 tiers:
 *       T1 lexical    — query shares keywords with the planted text (control; both should pass)
 *       T2 paraphrase — zero/near-zero keyword overlap (semantic search should win)
 *       T3 inference  — fact never stated in one message (extraction/consolidation should win;
 *                       FTS structurally cannot)
 *   - Scoring: an LLM judge (Haiku, temperature-free strict JSON) is shown the query, the
 *     ground-truth fact, and one system's top-k texts, and answers whether any retrieved item
 *     states or clearly entails the fact. Judge is blind to which system produced the list.
 *
 * Usage (from apps/worker, with XTRACE_* + ANTHROPIC_API_KEY + DATABASE_URL in the shell):
 *   npx tsx scripts/xtrace-stress-test.mts ingest            # prints RUN_ID
 *   npx tsx scripts/xtrace-stress-test.mts search <RUN_ID>   # retrieval + judging + report
 *   npx tsx scripts/xtrace-stress-test.mts all               # ingest, wait 90s, search
 *
 * Re-searchable: extraction is async server-side, so `search <RUN_ID>` can be re-run later
 * to see whether more facts have materialized. Each run uses a fresh groupId/userId namespace
 * so reruns never contaminate each other. The FTS baseline table is scoped by run_id too.
 */
import { xtraceClientFromEnv, type XtraceMemory } from '@receipts/companion';
import { connect } from '@receipts/db';

const TOP_K = 5;
const SETTLE_MS = 90_000;
const JUDGE_MODEL = 'claude-haiku-4-5-20251001';

// ---------------------------------------------------------------------------------------------
// Corpus: two rivals, 8 weeks of thread chatter. Planted facts are marked with `fact`.
// ---------------------------------------------------------------------------------------------

interface Msg {
  author: 'dex' | 'mo';
  week: number; // 1..8
  body: string;
  fact?: string; // planted-fact id, for the report only
}

const PLANTED: Msg[] = [
  // T1 lexical controls -------------------------------------------------------------------
  { author: 'dex', week: 6, body: 'rematch handled. took it 3-2 tonight. gg i guess', fact: 'F1' },
  { author: 'dex', week: 3, body: '5 leg parlay HIT. all five. screenshot or it didn\'t happen — here it is baby', fact: 'F2' },
  { author: 'mo', week: 7, body: 'callout sent. friday night, loser wears the L in their bio for a week. no backing out', fact: 'F10' },
  // T2 paraphrase --------------------------------------------------------------------------
  { author: 'mo', week: 4, body: 'got smoked 5-0 this week. not even close. embarrassing honestly', fact: 'F3' },
  { author: 'mo', week: 5, body: 'real talk i keep bricking my thursday picks. every single thursday man. cursed day', fact: 'F4' },
  { author: 'dex', week: 5, body: 'seven in a row now. SEVEN. crown me', fact: 'F5' },
  // T3 inference / consolidation ------------------------------------------------------------
  { author: 'mo', week: 2, body: 'dropped another one to him tonight. whatever', fact: 'F6' },
  { author: 'mo', week: 3, body: 'again?? that\'s like the third time straight he got me', fact: 'F6' },
  { author: 'mo', week: 4, body: 'i genuinely cannot buy a win vs this dude anymore', fact: 'F6' },
  { author: 'mo', week: 1, body: 'fading the public is a lifestyle. i will never bet a favorite. never', fact: 'F7' },
  { author: 'mo', week: 6, body: 'ok experiment over. fading has been torching my bankroll, i\'m going chalk the rest of the season', fact: 'F7' },
  { author: 'dex', week: 2, body: 'another week decided by the very last leg. of course', fact: 'F8' },
  { author: 'mo', week: 5, body: 'down to the wire AGAIN. i need a drink', fact: 'F8' },
  { author: 'dex', week: 7, body: 'one pick margin. every. single. week. i swear we\'re cursed', fact: 'F8' },
  { author: 'dex', week: 8, body: 'third season running against the same guy. we should get married at this point', fact: 'F9' },
];

// Filler: realistic chatter that never states any planted fact. A few deliberate distractors
// share keywords with T1/T2 queries ("rematch", "parlay", "streak") in irrelevant contexts.
const FILLER: string[] = [
  'this ref needs glasses. actual glasses',
  'anyone else\'s app lagging on the live board or just me',
  'wings ordered. game on in 20',
  'bro really picked against his own team lmao',
  'weather delay AGAIN. why do i do outdoor sports',
  'the group chat is quiet tonight. suspicious',
  'injury report just dropped and it\'s a horror movie',
  'imagine tailing me. couldn\'t be you. (it should be you)',
  'lakers rematch on tv tonight, unrelated but i\'m watching',      // distractor: "rematch"
  'my uncle hit a parlay in 2019 and hasn\'t shut up since',        // distractor: "parlay"
  'the heat check is real, this announcer is on a streak of bad takes', // distractor: "streak"
  'who ate my leftovers. i had plans for that pad thai',
  'refs giving out flags like coupons today',
  'new profile pic. respect the drip',
  'line moved half a point and everyone is acting insane',
  'i would simply not miss a free throw in that situation',
  'monday morning quarterbacks assemble',
  'my sleep schedule is a suggestion at this point',
  'they should let me announce one game. one.',
  'the vibes in this thread are rancid tonight and i love it',
  'petition to ban overtime on school nights',
  'coffee number four. do not perceive me',
  'somebody check on the fans of that team. wellness check',
  'i miss when this thread was about anything at all',
];

function buildCorpus(): Msg[] {
  const msgs: Msg[] = [...PLANTED];
  // Deterministic LCG so reruns build the identical corpus.
  let seed = 1337;
  const rand = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  for (let week = 1; week <= 8; week++) {
    const perWeek = 18; // ~144 filler + 15 planted ≈ 160 total
    for (let i = 0; i < perWeek; i++) {
      msgs.push({
        author: rand() < 0.5 ? 'dex' : 'mo',
        week,
        body: FILLER[Math.floor(rand() * FILLER.length)]!,
      });
    }
  }
  // Stable-ish shuffle within week ordering: sort by (week, rand tiebreak)
  return msgs
    .map((m) => ({ m, k: m.week + rand() }))
    .sort((x, y) => x.k - y.k)
    .map((x) => x.m);
}

// ---------------------------------------------------------------------------------------------
// Query set + answer key
// ---------------------------------------------------------------------------------------------

interface Query {
  id: string;
  tier: 'T1' | 'T2' | 'T3';
  query: string;
  groundTruth: string;
}

const QUERIES: Query[] = [
  { id: 'Q1', tier: 'T1', query: 'who won the rematch', groundTruth: 'dex won the rematch 3-2' },
  { id: 'Q2', tier: 'T1', query: 'did the parlay hit', groundTruth: "dex's 5-leg parlay hit (all five legs won)" },
  { id: 'Q3', tier: 'T1', query: 'what were the callout stakes', groundTruth: 'the callout stakes: the loser wears the L in their bio for a week' },
  { id: 'Q4', tier: 'T2', query: 'biggest blowout defeat', groundTruth: 'mo lost 5-0, a total blowout' },
  { id: 'Q5', tier: 'T2', query: 'which day of the week does mo usually lose on', groundTruth: 'mo keeps losing his Thursday picks' },
  { id: 'Q6', tier: 'T2', query: 'longest winning streak', groundTruth: 'dex won seven in a row' },
  { id: 'Q7', tier: 'T3', query: 'is anyone on a losing streak against their rival', groundTruth: 'mo has lost at least three consecutive matchups to dex' },
  { id: 'Q8', tier: 'T3', query: "what is mo's current betting strategy", groundTruth: 'mo abandoned fading the public and now bets favorites (chalk) — his CURRENT strategy is chalk' },
  { id: 'Q9', tier: 'T3', query: 'are their weekly matchups usually close', groundTruth: 'yes — their matchups are repeatedly decided by one pick / the last leg / down to the wire' },
  { id: 'Q10', tier: 'T3', query: 'how long have dex and mo been rivals', groundTruth: 'three seasons running' },
];

// ---------------------------------------------------------------------------------------------
// Systems
// ---------------------------------------------------------------------------------------------

function groupId(runId: string) {
  return `stress:${runId}`;
}

async function ingestXtrace(runId: string, corpus: Msg[]): Promise<void> {
  const xtrace = xtraceClientFromEnv();
  if (!xtrace) throw new Error('XTRACE_API_KEY / XTRACE_APP_ID not set');
  // One conv per author-week, mirroring how the real job batches thread posts.
  const byConv = new Map<string, Msg[]>();
  for (const m of corpus) {
    const key = `${m.author}:w${m.week}`;
    (byConv.get(key) ?? byConv.set(key, []).get(key)!).push(m);
  }
  let sent = 0;
  for (const [key, msgs] of byConv) {
    const [author, week] = key.split(':') as [string, string];
    const ok = await xtrace.ingest({
      userId: `stress:${runId}:${author}`,
      convId: `stress:${runId}:${author}:${week}`,
      groupIds: [groupId(runId)],
      messages: msgs.map((m) => ({
        role: 'user' as const,
        content: `${m.author}: ${m.body}`,
        date: new Date(Date.UTC(2026, 4, 4 + (m.week - 1) * 7, 18)).toISOString(),
      })),
    });
    if (!ok) console.warn(`xtrace ingest failed for conv ${key}`);
    else sent += msgs.length;
  }
  console.log(`xtrace: ingested ${sent}/${corpus.length} messages across ${byConv.size} convs`);
}

async function ingestFts(pool: any, runId: string, corpus: Msg[]): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stress_fts (
      run_id text NOT NULL,
      author text NOT NULL,
      week int NOT NULL,
      body text NOT NULL
    )`);
  for (const m of corpus) {
    await pool.query('INSERT INTO stress_fts (run_id, author, week, body) VALUES ($1,$2,$3,$4)', [
      runId,
      m.author,
      m.week,
      m.body,
    ]);
  }
  console.log(`fts: inserted ${corpus.length} rows for run ${runId}`);
}

async function searchXtrace(runId: string, q: Query): Promise<string[]> {
  const xtrace = xtraceClientFromEnv();
  if (!xtrace) throw new Error('xtrace unconfigured');
  const memories: XtraceMemory[] = await xtrace.search({
    query: q.query,
    groupIds: [groupId(runId)],
    include: ['fact', 'episode'],
    limit: TOP_K,
  });
  return memories.slice(0, TOP_K).map((m) => `[${m.type}] ${m.text}`);
}

async function searchFts(pool: any, runId: string, q: Query): Promise<string[]> {
  const { rows } = await pool.query(
    `SELECT author || ': ' || body AS t,
            ts_rank(to_tsvector('english', body), websearch_to_tsquery('english', $2)) AS rank
       FROM stress_fts
      WHERE run_id = $1
        AND to_tsvector('english', body) @@ websearch_to_tsquery('english', $2)
      ORDER BY rank DESC
      LIMIT $3`,
    [runId, q.query, TOP_K],
  );
  return rows.map((r: any) => r.t);
}

// ---------------------------------------------------------------------------------------------
// LLM judge (blind to which system produced the list)
// ---------------------------------------------------------------------------------------------

async function judge(q: Query, retrieved: string[]): Promise<boolean> {
  if (retrieved.length === 0) return false;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const body = {
    model: JUDGE_MODEL,
    max_tokens: 150,
    system:
      'You are a strict retrieval evaluator. Given a query, a ground-truth fact, and a list of retrieved text items, decide whether ANY retrieved item states or clearly entails the ground-truth fact. Paraphrase counts. Topical similarity without the actual fact does NOT count. Reply with ONLY strict JSON: {"hit": true|false, "item": <1-based index or null>}',
    messages: [
      {
        role: 'user',
        content: `Query: ${q.query}\nGround-truth fact: ${q.groundTruth}\n\nRetrieved items:\n${retrieved
          .map((t, i) => `${i + 1}. ${t}`)
          .join('\n')}`,
      },
    ],
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(`judge: status ${res.status}, attempt ${attempt + 1}`);
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    const json: any = await res.json();
    const text: string = json.content?.[0]?.text ?? '';
    const match = text.match(/\{[^}]*\}/);
    if (match) {
      try {
        return Boolean(JSON.parse(match[0]).hit);
      } catch {
        console.warn(`judge: unparseable reply: ${text}`);
      }
    }
  }
  throw new Error(`judge failed for ${q.id}`);
}

// ---------------------------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------------------------

async function runIngest(runId: string): Promise<void> {
  const corpus = buildCorpus();
  const planted = corpus.filter((m) => m.fact).length;
  console.log(`corpus: ${corpus.length} messages (${planted} planted across 10 facts)`);
  const { pool } = connect();
  try {
    await ingestFts(pool, runId, corpus);
    await ingestXtrace(runId, corpus);
  } finally {
    await pool.end();
  }
  console.log(`RUN_ID=${runId}`);
}

async function runSearch(runId: string): Promise<void> {
  const { pool } = connect();
  const results: Array<{
    id: string;
    tier: string;
    query: string;
    xtraceHit: boolean;
    ftsHit: boolean;
    xtraceRetrieved: string[];
    ftsRetrieved: string[];
  }> = [];
  try {
    for (const q of QUERIES) {
      const [xr, fr] = await Promise.all([searchXtrace(runId, q), searchFts(pool, runId, q)]);
      const [xHit, fHit] = await Promise.all([judge(q, xr), judge(q, fr)]);
      results.push({
        id: q.id,
        tier: q.tier,
        query: q.query,
        xtraceHit: xHit,
        ftsHit: fHit,
        xtraceRetrieved: xr,
        ftsRetrieved: fr,
      });
      console.log(`${q.id} (${q.tier}) "${q.query}" → xtrace:${xHit ? 'HIT' : 'miss'} fts:${fHit ? 'HIT' : 'miss'}`);
    }
  } finally {
    await pool.end();
  }

  console.log('\n=== hit@5 by tier ===');
  for (const tier of ['T1', 'T2', 'T3'] as const) {
    const rs = results.filter((r) => r.tier === tier);
    const x = rs.filter((r) => r.xtraceHit).length;
    const f = rs.filter((r) => r.ftsHit).length;
    console.log(`${tier}: xtrace ${x}/${rs.length}  |  fts ${f}/${rs.length}`);
  }
  const xAll = results.filter((r) => r.xtraceHit).length;
  const fAll = results.filter((r) => r.ftsHit).length;
  console.log(`ALL: xtrace ${xAll}/${results.length}  |  fts ${fAll}/${results.length}`);

  const reportPath = `${process.env.STRESS_REPORT_DIR ?? '/tmp'}/xtrace-stress-${runId}.json`;
  const { writeFileSync } = await import('node:fs');
  writeFileSync(reportPath, JSON.stringify({ runId, topK: TOP_K, judgeModel: JUDGE_MODEL, results }, null, 2));
  console.log(`report: ${reportPath}`);
}

const [mode, runIdArg] = process.argv.slice(2);
if (mode === 'ingest') {
  const runId = Date.now().toString(36);
  await runIngest(runId);
} else if (mode === 'search') {
  if (!runIdArg) throw new Error('usage: search <RUN_ID>');
  await runSearch(runIdArg);
} else if (mode === 'all') {
  const runId = Date.now().toString(36);
  await runIngest(runId);
  console.log(`settling ${SETTLE_MS / 1000}s for server-side extraction...`);
  await new Promise((r) => setTimeout(r, SETTLE_MS));
  await runSearch(runId);
} else {
  throw new Error('usage: xtrace-stress-test.mts <ingest | search <RUN_ID> | all>');
}

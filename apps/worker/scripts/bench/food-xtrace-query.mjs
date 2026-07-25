/**
 * Query the food corpus in xTrace (user-scoped; episodes carry empty group_ids so group scoping
 * would return none) and write a lane-keyed JSON for the shared judge.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PROBES } from './food-corpus.mjs';

const apiKey = process.env.XTRACE_API_KEY;
const base = process.env.XTRACE_API_BASE || 'https://api.production.xtrace.ai';
const appId = process.env.XTRACE_APP_ID;
const OUT = process.env.BENCH_OUT || '/tmp/claude-0/-home-user-Gambappe/318c540c-00ed-5b31-a2f4-340577435dd8/scratchpad';
const { user } = JSON.parse(readFileSync(`${OUT}/food-state.json`, 'utf8'));

async function search(query, mode) {
  const r = await fetch(`${base}/v1/memories/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({ query, mode, user_id: user, group_ids: [], app_id: appId, include: ['fact', 'episode'] }),
  });
  const j = await r.json().catch(() => ({}));
  return { rows: j.data || [], context: j.context || null };
}

const lanes = { 'xtrace-retrieve': {}, 'xtrace-compose': {} };
for (const p of PROBES) {
  const ret = await search(p.query, 'retrieve');
  lanes['xtrace-retrieve'][p.id] = ret.rows.slice(0, 5).map((m) => `[${m.type}] ${m.text}`);
  const comp = await search(p.query, 'compose');
  // compose's payload to a consumer is the assembled context block
  lanes['xtrace-compose'][p.id] = comp.context
    ? [comp.context]
    : comp.rows.slice(0, 5).map((m) => `[${m.type}] ${m.text}`);
}

writeFileSync(`${OUT}/food-xtrace-results.json`, JSON.stringify(lanes, null, 2));
for (const [lane, per] of Object.entries(lanes)) {
  console.log(`\n===== ${lane}`);
  for (const p of PROBES) {
    console.log(`\n  [${p.id}] ${p.query}`);
    for (const t of per[p.id]) console.log(`     - ${String(t).replace(/\n/g, '\n       ').slice(0, 900)}`);
  }
}
console.log(`\nwrote ${OUT}/food-xtrace-results.json`);

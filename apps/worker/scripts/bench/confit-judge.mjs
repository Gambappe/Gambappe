/**
 * Query all four lanes and score. A probe is a HIT when the retrieved payload contains evidence
 * that supports the induced truth. Compose payloads arrive as one assembled block, so they are
 * split into lines before counting — scoring a block per-item under-reports it badly (a mistake
 * made twice earlier in this work).
 */
import { readFileSync } from 'node:fs';
import { PROBES } from './confit-corpus.mjs';

const apiKey = process.env.XTRACE_API_KEY;
const base = process.env.XTRACE_API_BASE || 'https://api.production.xtrace.ai';
const appId = process.env.XTRACE_APP_ID;
const OUT = process.env.BENCH_OUT || '/tmp/claude-0/-home-user-Gambappe/318c540c-00ed-5b31-a2f4-340577435dd8/scratchpad';

const { users } = JSON.parse(readFileSync(`${OUT}/confit-state.json`, 'utf8'));
const pg = JSON.parse(readFileSync(`${OUT}/confit-pgvector.json`, 'utf8'));

async function xsearch(user, query, mode) {
  const r = await fetch(`${base}/v1/memories/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({ query, mode, user_id: user, group_ids: [], app_id: appId, include: ['fact', 'episode'] }),
  });
  const j = await r.json().catch(() => ({}));
  if (mode === 'compose' && j.context) return [j.context];
  return (j.data || []).slice(0, 5).map((m) => `[${m.type}] ${m.text}`);
}

const units = (items) =>
  items.length === 1 && String(items[0]).includes('\n')
    ? String(items[0]).split('\n').map((l) => l.trim()).filter((l) => l && !/^#{1,3}\s*$/.test(l))
    : items;

const lanes = {};
for (const p of PROBES) {
  lanes[p.id] = {
    'xtrace-prose': await xsearch(users.prose, p.query, 'compose'),
    'xtrace-lesson': await xsearch(users.lesson, p.query, 'compose'),
    'pgvector-prose': pg['pgvector-prose'][p.id],
    'pgvector-lesson': pg['pgvector-lesson'][p.id],
  };
}

const LANES = ['xtrace-prose', 'xtrace-lesson', 'pgvector-prose', 'pgvector-lesson'];
const score = Object.fromEntries(LANES.map((l) => [l, 0]));

for (const p of PROBES) {
  console.log(`\n${'='.repeat(90)}\n[${p.id}] ${p.query}\n  truth: ${p.expect}`);
  for (const lane of LANES) {
    const u = units(lanes[p.id][lane]);
    const hits = u.filter((t) => p.re.test(t));
    if (hits.length) score[lane] += 1;
    console.log(`\n  ${lane.padEnd(16)} ${hits.length ? 'HIT ' : 'miss'} evidence=${hits.length}/${u.length}`);
    for (const h of hits.slice(0, 2)) console.log(`      + ${h.replace(/\s+/g, ' ').slice(0, 150)}`);
    if (!hits.length) for (const t of u.slice(0, 2)) console.log(`      - ${String(t).replace(/\s+/g, ' ').slice(0, 130)}`);
  }
}

console.log(`\n${'='.repeat(90)}\nTOTALS (of ${PROBES.length} probes)`);
const HARD = ['change', 'interaction'];
for (const lane of LANES) {
  const hard = HARD.filter((id) => {
    const p = PROBES.find((x) => x.id === id);
    return units(lanes[id][lane]).some((t) => p.re.test(t));
  }).length;
  console.log(`  ${lane.padEnd(16)} ${score[lane]}/${PROBES.length}   hard-probes ${hard}/2`);
}

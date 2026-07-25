/**
 * Ingest the food corpus into xTrace, one conversation per month, user-scoped.
 * Prose only — structured order data (the PGN equivalent) extracted zero facts.
 */
import { writeFileSync } from 'node:fs';
import { byMonth, monthName } from './food-corpus.mjs';

const apiKey = process.env.XTRACE_API_KEY;
const base = process.env.XTRACE_API_BASE || 'https://api.production.xtrace.ai';
const appId = process.env.XTRACE_APP_ID;
const OUT = process.env.BENCH_OUT || '/tmp/claude-0/-home-user-Gambappe/318c540c-00ed-5b31-a2f4-340577435dd8/scratchpad';
const RUN = process.argv[2] || Math.random().toString(36).slice(2, 8);
const USER = `food:${RUN}:diner`;

let sent = 0;
for (const [month, orders] of byMonth()) {
  const messages = orders.map((o) => ({
    role: 'user',
    content: o.text,
    date: new Date(Date.UTC(2026, month - 1, 5, 19)).toISOString(),
  }));
  const res = await fetch(`${base}/v1/memories`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({
      messages,
      user_id: USER,
      conv_id: `food:${RUN}:${monthName(month).toLowerCase()}`,
      app_id: appId,
      group_ids: [],
      agent_id: null,
    }),
  });
  if (res.ok) sent += orders.length;
  else console.warn(`ingest failed for ${monthName(month)}: ${res.status}`);
}

writeFileSync(`${OUT}/food-state.json`, JSON.stringify({ run: RUN, user: USER }));
console.log(`RUN=${RUN} user=${USER}`);
console.log(`ingested ${sent} orders across ${byMonth().length} monthly conversations`);

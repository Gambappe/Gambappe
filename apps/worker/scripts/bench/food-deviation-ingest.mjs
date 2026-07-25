/**
 * Ingest both deviation variants into xTrace under separate user namespaces, so each is a clean
 * store containing the full 8-month history PLUS one recent exception.
 */
import { writeFileSync } from 'node:fs';
import { byMonth, monthName, DEVIATIONS } from './food-corpus.mjs';

const apiKey = process.env.XTRACE_API_KEY;
const base = process.env.XTRACE_API_BASE || 'https://api.production.xtrace.ai';
const appId = process.env.XTRACE_APP_ID;
const OUT = process.env.BENCH_OUT || '/tmp/claude-0/-home-user-Gambappe/318c540c-00ed-5b31-a2f4-340577435dd8/scratchpad';
const RUN = process.argv[2] || Math.random().toString(36).slice(2, 8);

const users = {};
for (const variant of Object.keys(DEVIATIONS)) {
  const user = `fooddev:${RUN}:${variant}`;
  users[variant] = user;
  let sent = 0;
  for (const [month, orders] of byMonth(variant)) {
    const res = await fetch(`${base}/v1/memories`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        messages: orders.map((o) => ({
          role: 'user',
          content: o.text,
          date: new Date(Date.UTC(2026, month - 1, 5, 19)).toISOString(),
        })),
        user_id: user,
        conv_id: `fooddev:${RUN}:${variant}:${monthName(month).toLowerCase()}`,
        app_id: appId,
        group_ids: [],
        agent_id: null,
      }),
    });
    if (res.ok) sent += orders.length;
    else console.warn(`ingest failed ${variant}/${monthName(month)}: ${res.status}`);
  }
  console.log(`${variant}: ingested ${sent} orders -> ${user}`);
}

writeFileSync(`${OUT}/food-deviation-state.json`, JSON.stringify({ run: RUN, users }));
console.log(`RUN=${RUN}`);

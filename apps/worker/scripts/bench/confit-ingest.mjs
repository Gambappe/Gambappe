/**
 * Ingest the same corpus into xTrace twice under separate user namespaces:
 *   prose  — the confession as written (the suggestion)
 *   lesson — Confit's stripped five-field record (as designed)
 * Batched per month; isolated single messages get little or no extraction.
 */
import { writeFileSync } from 'node:fs';
import { byMonth, lessonText } from './confit-corpus.mjs';

const apiKey = process.env.XTRACE_API_KEY;
const base = process.env.XTRACE_API_BASE || 'https://api.production.xtrace.ai';
const appId = process.env.XTRACE_APP_ID;
const OUT = process.env.BENCH_OUT || '/tmp/claude-0/-home-user-Gambappe/318c540c-00ed-5b31-a2f4-340577435dd8/scratchpad';
const RUN = process.argv[2] || Math.random().toString(36).slice(2, 8);

const users = { prose: `confit:${RUN}:prose`, lesson: `confit:${RUN}:lesson` };

for (const [variant, user] of Object.entries(users)) {
  let sent = 0;
  for (const [month, items] of byMonth()) {
    const messages = items.map((c) => ({
      role: 'user',
      content: variant === 'prose' ? c.text : lessonText(c),
      date: new Date(Date.UTC(2026, month - 1, 6, 20)).toISOString(),
    }));
    const res = await fetch(`${base}/v1/memories`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        messages, user_id: user, conv_id: `confit:${RUN}:${variant}:m${month}`,
        app_id: appId, group_ids: [], agent_id: null,
      }),
    });
    if (res.ok) sent += items.length;
    else console.warn(`ingest failed ${variant} m${month}: ${res.status}`);
  }
  console.log(`${variant}: ${sent} records -> ${user}`);
}

writeFileSync(`${OUT}/confit-state.json`, JSON.stringify({ run: RUN, users }));
console.log(`RUN=${RUN}`);

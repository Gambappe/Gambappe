/**
 * Deviation test judge. Ground truth for both variants: this person STILL avoids dairy.
 *
 * Also sweeps the recency weight, because "add recency weighting" is only a cheap fix if it does
 * not need hand-tuning per dataset. If a small change in the constant flips the answer, the fix
 * is fragile in a way a single passing configuration hides.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { DEVIATION_PROBE, DEVIATIONS } from './food-corpus.mjs';

const OUT = process.env.BENCH_OUT || '/tmp/claude-0/-home-user-Gambappe/318c540c-00ed-5b31-a2f4-340577435dd8/scratchpad';
const apiKey = process.env.XTRACE_API_KEY;
const base = process.env.XTRACE_API_BASE || 'https://api.production.xtrace.ai';
const appId = process.env.XTRACE_APP_ID;

const { users } = JSON.parse(readFileSync(`${OUT}/food-deviation-state.json`, 'utf8'));
const pg = JSON.parse(readFileSync(`${OUT}/food-deviation-pgvector.json`, 'utf8'));

async function xsearch(user, mode) {
  const r = await fetch(`${base}/v1/memories/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({
      query: DEVIATION_PROBE.query, mode, user_id: user, group_ids: [], app_id: appId,
      include: ['fact', 'episode'],
    }),
  });
  const j = await r.json().catch(() => ({}));
  return mode === 'compose' && j.context
    ? [j.context]
    : (j.data || []).slice(0, 5).map((m) => `[${m.type}] ${m.text}`);
}

const EXCEPTION_RE = /once a year|exactly once|one-?off|exception|regret|birthday|despite|aside from|apart from|but remains|still (dairy[- ]free|avoids)/i;

function assess(items) {
  // `compose` returns ONE assembled block, so per-item counting would report "1 piece of
  // evidence" for a block containing a dozen. Split multi-line payloads into lines and score the
  // balance of evidence inside them; single-line payloads are already one claim each.
  const units =
    items.length === 1 && String(items[0]).includes('\n')
      ? String(items[0])
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.length > 0 && !/^#{1,3}\s*$/.test(l))
      : items;

  const free = units.filter((t) => DEVIATION_PROBE.dairyFreeRe.test(t)).length;
  const devIdx = units.findIndex((t) => DEVIATION_PROBE.deviationRe.test(t));
  const framesException = units.some(
    (t) => DEVIATION_PROBE.deviationRe.test(t) && EXCEPTION_RE.test(t),
  );
  let verdict;
  if (free === 0 && devIdx >= 0) verdict = 'FLIPPED';
  else if (free === 0) verdict = 'none';
  else if (devIdx >= 0 && free <= 1) verdict = 'at-risk';
  else verdict = 'robust';
  return { free, devRank: devIdx >= 0 ? devIdx + 1 : null, framesException, verdict };
}

const lanes = {};
for (const variant of Object.keys(DEVIATIONS)) {
  lanes[variant] = {
    'xtrace-retrieve': await xsearch(users[variant], 'retrieve'),
    'xtrace-compose': await xsearch(users[variant], 'compose'),
    'pgvector-plain': pg['pgvector-plain'][variant],
    'pgvector-recency': pg['pgvector-recency'][variant],
  };
}

for (const [variant, per] of Object.entries(lanes)) {
  console.log(`\n${'='.repeat(88)}\nVARIANT: ${variant} — "${DEVIATIONS[variant].text.slice(0, 70)}..."`);
  console.log(`truth: ${DEVIATION_PROBE.truth}`);
  for (const [lane, items] of Object.entries(per)) {
    const a = assess(items);
    console.log(
      `\n  ${lane.padEnd(18)} ${a.verdict.padEnd(8)} dairy-free-evidence=${a.free} deviation-rank=${a.devRank ?? '-'} frames-as-exception=${a.framesException ? 'YES' : 'no'}`,
    );
    for (const t of items) {
      const mark = DEVIATION_PROBE.deviationRe.test(t) ? ' <<< DEVIATION' : '';
      console.log(`     - ${String(t).replace(/\n/g, ' ').slice(0, 150)}${mark}`);
    }
  }
}

// Recency-weight sweep: at what weight does the deviation reach rank 1?
console.log(`\n${'='.repeat(88)}\nRECENCY-WEIGHT SENSITIVITY (pgvector, neutral variant)`);
const sweep = execFileSync('python3', [`${import.meta.dirname}/food-deviation-sweep.py`], {
  encoding: 'utf8',
  env: process.env,
});
console.log(sweep.split('\n').filter((l) => !/it\/s\]/.test(l)).join('\n'));

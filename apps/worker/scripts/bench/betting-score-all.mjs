/**
 * Score every lane -- xTrace's five plus the two pgvector lanes -- with ONE set of marker rules,
 * so the comparison is apples-to-apples. Rules are identical to xtrace-stress-score.mjs,
 * including the negative guards for the corpus's deliberate lexical distractors.
 */
import { readFileSync } from 'node:fs';
const DIR = process.env.BENCH_OUT ?? '/tmp/claude-0/-home-user-Gambappe/318c540c-00ed-5b31-a2f4-340577435dd8/scratchpad';
const RUN = process.env.STRESS_RUN ?? 'mryar6gy';

const xt = JSON.parse(readFileSync(`${DIR}/xtrace-stress-${RUN}.json`, 'utf8'));
const pg = JSON.parse(readFileSync(`${DIR}/betting-pgvector-results.json`, 'utf8'));

const RULES = {
  Q1: { pos: [/\b3-2\b/, /took it 3.2/i, /won the rematch/i], neg: [] },
  Q2: { pos: [/5[- ]leg parlay that hit/i, /parlay HIT/, /5 leg parlay/i, /all five/i, /five[- ]leg parlay/i], neg: [/uncle/i] },
  Q3: { pos: [/letter L in their bio/i, /wears? the L/i, /L in their bio/i], neg: [] },
  Q4: { pos: [/\b5-0\b/], neg: [] },
  Q5: { pos: [/thursday/i], neg: [] },
  Q6: { pos: [/seven in a row/i, /\b7 in a row\b/i, /seven straight/i], neg: [/bad takes/i] },
  Q7: { pos: [/third time straight/i, /three (consecutive|straight)/i, /cannot buy a win/i, /dropped another one/i], neg: [] },
  Q8: { pos: [/go(ing)? chalk/i, /chalk (for|the rest)/i, /bets? favorites/i], neg: [] },
  Q9: { pos: [/last leg/i, /one pick margin/i, /down to the wire/i], neg: [] },
  Q10: { pos: [/third season/i, /three seasons/i], neg: [] },
};

function hit(items, rule) {
  return items.some((raw) => {
    const t = String(raw);
    if (rule.neg.some((n) => n.test(t))) {
      const stripped = t.replace(/[^.\n]*uncle[^.\n]*\.?/gi, '').replace(/[^.\n]*bad takes[^.\n]*\.?/gi, '');
      return rule.pos.some((p) => p.test(stripped));
    }
    return rule.pos.some((p) => p.test(t));
  });
}

const XT_LANES = ['xtrace-group', 'xtrace-cleaned', 'xtrace-user', 'xtrace-user-balanced', 'xtrace-user-compose', 'fts'];
const PG_LANES = Object.keys(pg);
const LANES = [...XT_LANES, ...PG_LANES];

const tally = Object.fromEntries(LANES.map((l) => [l, { T1: 0, T2: 0, T3: 0, all: 0 }]));
const perQuery = [];
for (const q of xt.results) {
  const rule = RULES[q.id];
  const row = { id: q.id, tier: q.tier, hits: {} };
  for (const l of XT_LANES) row.hits[l] = hit(q.retrieved[l] ?? [], rule);
  for (const l of PG_LANES) row.hits[l] = hit(pg[l][q.id] ?? [], rule);
  for (const l of LANES) if (row.hits[l]) { tally[l][q.tier] += 1; tally[l].all += 1; }
  perQuery.push(row);
}

console.log('per-query:');
for (const row of perQuery) {
  console.log(`  ${row.id.padEnd(3)} ${row.tier} ` + LANES.map((l) => `${l.replace('xtrace-', 'xt-')}:${row.hits[l] ? 'HIT ' : 'miss'}`).join(' '));
}

const counts = { T1: 3, T2: 3, T3: 4, all: 10 };
console.log('\n=== hit@5 ===');
console.log('lane'.padEnd(22) + ['T1', 'T2', 'T3', 'ALL'].map((t) => t.padStart(6)).join(''));
for (const l of LANES) {
  console.log(
    l.padEnd(22) +
      ['T1', 'T2', 'T3', 'all'].map((t) => `${tally[l][t]}/${counts[t]}`.padStart(6)).join(''),
  );
}

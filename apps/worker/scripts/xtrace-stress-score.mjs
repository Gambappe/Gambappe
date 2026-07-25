/**
 * Deterministic scoring of the v6 stress run (the Haiku judge is unavailable — expired key).
 * Each query has a positive marker for the planted fact and, where the corpus contains a
 * deliberate lexical distractor, a negative guard so the distractor cannot score a false hit.
 */
import { readFileSync } from 'node:fs';
const DIR = '/tmp/claude-0/-home-user-Gambappe/318c540c-00ed-5b31-a2f4-340577435dd8/scratchpad';
const r = JSON.parse(readFileSync(`${DIR}/xtrace-stress-mryar6gy.json`, 'utf8'));

const RULES = {
  // F1: dex won the rematch 3-2. Distractor: "lakers rematch on tv tonight".
  Q1: { pos: [/\b3-2\b/, /took it 3.2/i, /won the rematch/i], neg: [] },
  // F2: dex's 5-leg parlay hit. Distractor: uncle's 2019 parlay.
  Q2: {
    pos: [/5[- ]leg parlay that hit/i, /parlay HIT/, /5 leg parlay/i, /all five/i, /five[- ]leg parlay/i],
    neg: [/uncle/i],
  },
  // F10: callout stakes = loser wears the L in their bio for a week.
  Q3: { pos: [/letter L in their bio/i, /wears? the L/i, /L in their bio/i], neg: [] },
  // F3: mo lost 5-0.
  Q4: { pos: [/\b5-0\b/], neg: [] },
  // F4: mo keeps losing Thursday picks.
  Q5: { pos: [/thursday/i], neg: [] },
  // F5: dex won seven in a row. Distractor: announcer "on a streak of bad takes".
  Q6: { pos: [/seven in a row/i, /\b7 in a row\b/i, /seven straight/i], neg: [/bad takes/i] },
  // F6: mo lost >=3 consecutive to dex.
  Q7: {
    pos: [/third time straight/i, /three (consecutive|straight)/i, /cannot buy a win/i, /dropped another one/i],
    neg: [],
  },
  // F8 (mo's CURRENT strategy = chalk); must show the switch, not just the abandoned fade.
  // "go chalk" / "going chalk" / "go chalk for the rest of the season" — the earlier /going chalk/
  // only form missed the compose context's "deciding to go chalk for the rest of the season".
  Q8: { pos: [/go(ing)? chalk/i, /chalk (for|the rest)/i, /bets? favorites/i], neg: [] },
  // F8: matchups repeatedly close.
  Q9: { pos: [/last leg/i, /one pick margin/i, /down to the wire/i], neg: [] },
  // F9: three seasons running.
  Q10: { pos: [/third season/i, /three seasons/i], neg: [] },
};

const LANES = [
  'xtrace-group',
  'xtrace-cleaned',
  'xtrace-user',
  'xtrace-user-balanced',
  'xtrace-user-compose',
  'fts',
];

function hit(items, rule) {
  return items.some((raw) => {
    const t = String(raw);
    if (rule.neg.some((n) => n.test(t)) && !rule.pos.some((p) => p.test(t.replace(/uncle[^.]*\./gi, '')))) {
      // Distractor-only text: strip the distractor clause and re-test.
      const stripped = t.replace(/[^.]*uncle[^.]*\./gi, '').replace(/[^.]*bad takes[^.]*\./gi, '');
      return rule.pos.some((p) => p.test(stripped));
    }
    return rule.pos.some((p) => p.test(t));
  });
}

const tally = Object.fromEntries(LANES.map((l) => [l, { T1: 0, T2: 0, T3: 0, all: 0 }]));
const perQuery = [];
for (const q of r.results) {
  const rule = RULES[q.id];
  const row = { id: q.id, tier: q.tier, query: q.query, hits: {} };
  for (const l of LANES) {
    const h = hit(q.retrieved[l] || [], rule);
    row.hits[l] = h;
    if (h) {
      tally[l][q.tier] += 1;
      tally[l].all += 1;
    }
  }
  perQuery.push(row);
}

console.log('per-query (deterministic marker scoring):');
for (const row of perQuery) {
  console.log(
    `  ${row.id.padEnd(3)} ${row.tier} ${LANES.map((l) => `${l.replace('xtrace-', '')}:${row.hits[l] ? 'HIT ' : 'miss'}`).join(' ')}`,
  );
}

const counts = { T1: 3, T2: 3, T3: 4, all: 10 };
console.log('\n=== hit@5 ===');
for (const tier of ['T1', 'T2', 'T3', 'all']) {
  console.log(
    `${String(tier).padEnd(4)} ${LANES.map((l) => `${l.replace('xtrace-', '').padEnd(14)} ${tally[l][tier]}/${counts[tier]}`).join(' | ')}`,
  );
}

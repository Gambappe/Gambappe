/**
 * The decisive question for per-move commentary: given a fresh position, does xTrace return the
 * decision points from the SAME archetype, or just an undifferentiated dump of the player?
 *
 * precision@k = share of top-k whose archetype matches the queried archetype. A system that
 * cannot discriminate lands near the 25% base rate (4 equally-sized archetypes).
 */
import { readFileSync } from 'node:fs';
const apiKey = process.env.XTRACE_API_KEY;
const base = process.env.XTRACE_API_BASE || 'https://api.production.xtrace.ai';
const appId = process.env.XTRACE_APP_ID;
const DIR = '/tmp/claude-0/-home-user-Gambappe/318c540c-00ed-5b31-a2f4-340577435dd8/scratchpad';
const { user } = JSON.parse(readFileSync(`${DIR}/position-state.json`, 'utf8'));

// Fresh positions the player has never been in, described the way a live engine/annotator would.
const PROBES = [
  ['iqp', 'White has an isolated queen\'s pawn on d4 in the middlegame with active pieces; a queen trade is available right now.'],
  ['opposite', 'The kings are castled on opposite wings and both sides have flank pawns ready to storm; who gets there first?'],
  ['rook', 'A rook endgame a pawn down: should the rook stay back and defend, or activate and counterattack?'],
  ['closed', 'A completely closed centre with locked pawn chains and no pawn break played yet; slow manoeuvring position.'],
];

// Archetype classification by distinctive vocabulary of the ingested decision points.
const MARK = {
  iqp: /isolated (queen'?s )?pawn|isolated d-?pawn|iqp/i,
  opposite: /opposite[- ]side|opposite wings|pawn storm|h-pawn|castled queenside/i,
  rook: /rook end(game|ing)|activate the rook|passive defence|back rank/i,
  closed: /closed|locked pawn|manoeuvr|shuffl|pawn break|repetition/i,
};

function classify(text) {
  const hits = Object.entries(MARK).filter(([, re]) => re.test(text)).map(([k]) => k);
  return hits.length === 1 ? hits[0] : hits.length === 0 ? 'none' : `ambig(${hits.join('/')})`;
}

async function search(query, mode) {
  const res = await fetch(`${base}/v1/memories/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({
      query, mode, user_id: user, group_ids: [], app_id: appId, include: ['fact', 'episode'],
    }),
  });
  const j = await res.json().catch(() => ({}));
  return { rows: j.data || [], context: j.context || null };
}

for (const mode of ['retrieve', 'compose']) {
  console.log(`\n${'='.repeat(80)}\nMODE: ${mode}\n${'='.repeat(80)}`);
  let sumP5 = 0;
  for (const [arch, probe] of PROBES) {
    const { rows } = await search(probe, mode);
    const top = rows.slice(0, 5);
    const labels = top.map((m) => classify(m.text));
    const correct = labels.filter((l) => l === arch).length;
    const p5 = top.length ? correct / top.length : 0;
    sumP5 += p5;
    console.log(`\n[${arch}] total=${rows.length} top5=${top.length} precision@5=${p5.toFixed(2)}`);
    console.log(`  probe: ${probe.slice(0, 95)}...`);
    top.forEach((m, i) => {
      console.log(`   ${i + 1}. (${labels[i]}) [${m.type}] ${String(m.text).replace(/\n/g, ' ').slice(0, 130)}`);
    });
  }
  console.log(`\nMEAN precision@5 (${mode}): ${(sumP5 / PROBES.length).toFixed(2)}   [base rate 0.25]`);
}

// Does the query change the result set at all, or is it a fixed per-user dump?
console.log(`\n${'='.repeat(80)}\nDISCRIMINATION CHECK: do different probes return different rows?`);
const sets = [];
for (const [arch, probe] of PROBES) {
  const { rows } = await search(probe, 'retrieve');
  sets.push([arch, rows.slice(0, 5).map((m) => m.id).join(',')]);
}
for (const [a, ids] of sets) console.log(`  ${a.padEnd(10)} top5 ids: ${ids.slice(0, 90)}`);
console.log(`  distinct top-5 orderings: ${new Set(sets.map((s) => s[1])).size} of ${sets.length}`);

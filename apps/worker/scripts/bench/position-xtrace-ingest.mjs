/**
 * Can xTrace act as a "what did this player do in a similar position?" index?
 *
 * Per-move commentary needs retrieval keyed on POSITION TYPE, not on the player. So: ingest 16
 * decision points spanning 4 distinct position archetypes, where the player has a consistent
 * (and different) tendency in each. Then query with a fresh position of one archetype and
 * measure whether the top-k is dominated by that archetype.
 *
 * Positions are described in natural-language chess terms, never FEN/PGN — raw notation scored
 * 0 extracted facts across 8 complete games (docs/xtrace-episode-retrieval-findings.md).
 */
import { writeFileSync } from 'node:fs';
const apiKey = process.env.XTRACE_API_KEY;
const base = process.env.XTRACE_API_BASE || 'https://api.production.xtrace.ai';
const appId = process.env.XTRACE_APP_ID;
const DIR = '/tmp/claude-0/-home-user-Gambappe/318c540c-00ed-5b31-a2f4-340577435dd8/scratchpad';
const RUN = process.argv[2] || Math.random().toString(36).slice(2, 8);

// 4 archetypes x 4 decision points. Tendency is consistent WITHIN an archetype and different
// ACROSS them, so a retrieval that cannot discriminate will visibly mix them.
const DECISIONS = [
  // --- IQP: Kestrel always trades queens while holding the isolated pawn (a bad habit) ---
  ['iqp', 'vs Ferrant, 2026-02-07', 'Kestrel reached a middlegame holding an isolated queen\'s pawn on d4 with active pieces and a half-open e-file. With the initiative available, Kestrel offered a queen trade on d1 anyway. The trade removed the attacking chances the isolated pawn was supposed to pay for, and the pawn became a static weakness. Kestrel lost the endgame on move 48.'],
  ['iqp', 'vs Baltus, 2026-02-21', 'Another isolated queen\'s pawn middlegame for Kestrel, this time with both bishops pointing at the kingside. Kestrel again steered into a queen exchange rather than playing for the attack. Without queens the isolated d-pawn was simply weak, and Kestrel spent forty moves defending it before conceding a draw.'],
  ['iqp', 'vs Nowicki, 2026-03-14', 'Kestrel took on an isolated queen\'s pawn structure out of the opening and had a clear kingside attacking setup. At the critical moment Kestrel traded queens once more. The resulting endgame was joyless defence and Kestrel lost the isolated pawn on move 39.'],
  ['iqp', 'vs Ostrowska, 2026-04-02', 'Isolated queen\'s pawn position again for Kestrel with a strong outpost. Kestrel repeated the pattern and exchanged queens at the first opportunity, converting a dynamic position into a passive one. Drawn after long defence.'],

  // --- Opposite-side castling: Kestrel is fast and ruthless, gets there first, wins ---
  ['opposite', 'vs Halvard, 2026-02-11', 'Opposite-side castling: Kestrel castled queenside, opponent kingside. Kestrel threw the h-pawn up the board immediately, ignoring development niceties, and opened the h-file first. The attack landed and Kestrel won on move 27.'],
  ['opposite', 'vs Sandoval, 2026-03-01', 'Another opposite-castling race. Kestrel started the pawn storm on move 12, before completing development, and got the g- and h-pawns rolling ahead of the opponent\'s queenside play. Kestrel broke through first and won on move 31.'],
  ['opposite', 'vs Weiss, 2026-03-22', 'Kings castled on opposite wings. Kestrel again prioritised speed over structure, pushing the h-pawn and sacrificing a pawn to rip open the file. The opponent was one tempo short and Kestrel converted on move 29.'],
  ['opposite', 'vs Duarte, 2026-04-18', 'Opposite-side castling with mutual attacks. Kestrel launched the flank pawns immediately and did not stop to defend, winning the race by a single move on move 34.'],

  // --- Rook endings: Kestrel defends passively instead of activating ---
  ['rook', 'vs Kowalczyk, 2026-01-30', 'Rook endgame a pawn down. The active defence was available with the rook going behind the passed pawn, but Kestrel put the rook on the back rank and defended passively. The passive setup lost by zugzwang on move 61.'],
  ['rook', 'vs Iverson, 2026-02-25', 'Another rook ending a pawn down for Kestrel. Rather than activating the rook and counterattacking the queenside pawns, Kestrel again chose passive defence along the first rank and slowly got squeezed, losing on move 58.'],
  ['rook', 'vs Marchetti, 2026-03-19', 'Rook endgame, level material but a worse structure. Kestrel declined to activate the rook, kept it tied to defending a pawn, and drifted into a lost position by move 55.'],
  ['rook', 'vs Aubert, 2026-04-11', 'Rook ending a pawn down where the drawing method required immediate rook activity. Kestrel defended passively once more and only escaped with a draw because the opponent erred on move 63.'],

  // --- Closed positions: Kestrel shuffles, avoids committing, takes draws ---
  ['closed', 'vs Petrenko, 2026-02-03', 'A completely closed position with a locked pawn chain and no immediate breaks. Kestrel declined to prepare either pawn break, shuffled the pieces between the back two ranks, and offered a draw on move 30.'],
  ['closed', 'vs Lindqvist, 2026-03-07', 'Closed centre, manoeuvring game. Kestrel had the option of a queenside break but avoided committing to it, repeated moves instead, and the game was drawn by repetition on move 28.'],
  ['closed', 'vs Ferreira, 2026-03-28', 'Another blocked structure where the plan required a slow buildup and a pawn break. Kestrel showed no appetite for it, manoeuvred without a plan, and agreed a draw on move 33.'],
  ['closed', 'vs Tanaka, 2026-04-25', 'Closed position with chances for both sides if either committed. Kestrel kept everything on the back ranks, refused the break, and drew on move 26.'],
];

const USER = `chess2:${RUN}:kestrel`;

let ok = 0;
for (let i = 0; i < DECISIONS.length; i++) {
  const [arch, header, body] = DECISIONS[i];
  // One conversation per decision point (batched as a short review, not a lone message —
  // isolated single-message ingests get little or no extraction).
  const messages = [
    { role: 'user', content: `Post-game review, ${header}.`, date: new Date(Date.UTC(2026, 4, 1 + i)).toISOString() },
    { role: 'user', content: body, date: new Date(Date.UTC(2026, 4, 1 + i)).toISOString() },
    { role: 'user', content: 'Log this decision point for future reference.', date: new Date(Date.UTC(2026, 4, 1 + i)).toISOString() },
  ];
  const res = await fetch(`${base}/v1/memories`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({
      messages,
      user_id: USER,
      conv_id: `chess2:${RUN}:${arch}:${i}`,
      app_id: appId,
      group_ids: [],
      agent_id: null,
    }),
  });
  if (res.ok) ok++;
  else console.warn(`ingest failed ${arch}:${i} -> ${res.status}`);
}

writeFileSync(`${DIR}/position-state.json`, JSON.stringify({ run: RUN, user: USER }));
console.log(`RUN=${RUN} user=${USER}`);
console.log(`ingested ${ok}/${DECISIONS.length} decision points across 4 archetypes`);

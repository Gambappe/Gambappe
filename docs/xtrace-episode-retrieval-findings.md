# xTrace retrieval findings: group scoping hides episodes

Empirical investigation run 2026-07-25 using a chess color-commentary scenario as a neutral
test domain (deliberately unlike the betting product, so the conclusions are about xTrace's
behaviour rather than our corpus). Reproduction scripts are throwaway; the method is described
below so it can be re-run.

## Headline

**Group-scoped search (`group_ids: [...]`) returns facts only — it never returns episodes,
because xTrace creates episodes with `group_ids: []`.** Episodes are where xTrace puts the
cross-record pattern synthesis, which is the most valuable content for any "color" generation.
Scoping by `user_id` instead reaches episodes and is fully isolated.

Our own code is inconsistent about this today:

| call site | scoping | reaches episodes? |
| --- | --- | --- |
| `apps/web/lib/companion/banter.ts:174` | `groupIds` only | **no** |
| `apps/web/lib/companion/callout-draft.ts:83` | `groupIds` only | **no** |
| `apps/web/lib/companion/callout-draft.ts:89` | `userId` only | yes |
| `apps/worker/src/jobs/companion-season-recap.ts:159` | `userId` only | yes |

All four pass `include: ['fact', 'episode']`, so the intent was always to read episodes. Two of
the four silently never get any.

## Method

Two fictional players, 8 past games each, all against *other* opponents (never each other) —
matching a "generate commentary about two players who have no shared history" use case. Each
player had behavioural patterns planted that are only inferable *across* games, never stated in
any single record:

- **Kestrel** — always 1.e4 as White; Najdorf as Black; repeatedly loses winning positions on
  time; grinds rook endgames; currently on a 3-game win streak.
- **Priya** — London System in every White game until a switch to 1.c4 in her last two; loses
  material to knight forks (3× in a season); early queen sorties; resigns early, once in a
  position that was actually winning.

Four ingest lanes (one group each): `raw` (literal PGN with headers, movetext, engine evals,
`Termination "Time forfeit"`) and `annotated` (the same games as one-paragraph natural-language
game reports), per player. Games were batched into 2 conversations per lane — isolated
single-message ingests get little or no extraction.

## What survived extraction

Group-scoped retrieval, after settling:

| lane | facts | episodes |
| --- | --- | --- |
| kestrel-raw (PGN) | 0 | 0 |
| kestrel-annotated | 1 | 0 |
| priya-raw (PGN) | 3 | 0 |
| priya-annotated | 9 | 0 |

Two things stand out.

**Raw PGN is close to useless.** Kestrel's PGN lane produced *zero* facts from 8 complete games.
Priya's produced 3, all single-game trivia ("featured a knight fork on c2"), no patterns. Feed
xTrace prose, not notation.

**Extraction is inconsistent between comparable inputs.** Priya's annotated lane produced 9
facts; Kestrel's produced 1, from the same script, same batching, same game count. Kestrel's
patterns were not lost — they went into *episodes* instead of facts. Which shape a given corpus
lands in is not something the caller controls.

## The episodes contain what the facts miss

Episodes existed all along and are strong. Retrieved via `user_id` scoping, Kestrel's
compose-mode context returned this single episode:

> Reviewed a sequence of Kestrel games from 2026-06-06 through 2026-07-11, all opened with 1.e4.
> The earliest result was a draw against EndgameEnjoyer on 2026-06-06, where Kestrel held a worse
> rook endgame comfortably. That was followed by a rook-endgame win over CaroKannFan on
> 2026-06-20, which marked the start of the current win streak. The streak continued with a
> Najdorf win as Black against QueensGambitQueen on 2026-06-27 and then a White win over
> DragonSlayer_7 on 2026-07-11, bringing the winning streak to 3 games.

That one memory covers four of five planted Kestrel patterns, including the exact streak count —
none of which appears in any single ingested record. Other episodes captured the remaining one
("The main issue was clock management", "why strong positions still turned into losses").

xTrace also synthesizes causal claims. From Priya's lane, as a `fact`:

> When Priya keeps losing with 1.d4 to knight forks or cheap tricks, switch her White opening to
> 1.c4 (English) instead of the usual London/1.d4, because the 1.c4 games were the ones that
> stopped the repeated material-loss pattern and produced a draw then a win.

Note the framing: xTrace writes advice addressed to a user ("switch her opening"), not neutral
biography. Anything consuming this for third-person commentary has to re-voice it.

## Coverage by retrieval path

Planted patterns recovered (✓ full, ~ partial, ✗ absent):

| pattern | group-scoped facts (today) | `user_id`-scoped, facts + episodes |
| --- | --- | --- |
| Kestrel: 1.e4 as White | ✗ | ✓ |
| Kestrel: Najdorf as Black | ✗ | ✓ |
| Kestrel: loses won positions on time | ✗ | ✓ |
| Kestrel: rook-endgame strength | ✗ | ✓ |
| Kestrel: 3-game win streak | ~ (streak, no count) | ✓ (exact count) |
| Priya: London System repertoire | ✓ | ✓ |
| Priya: knight-fork weakness, 3× | ✓ | ✓ |
| Priya: early queen aggression | ✗ | ✗ |
| Priya: resigns early | ✗ | ~ |
| Priya: switch to 1.c4 | ✓ | ✓ |

Roughly **3.5/10 today vs 8.5/10** with `user_id` scoping and episodes.

## Isolation is safe

`user_id` scoping was probed with 7 adversarial queries per player, including cross-player
probes, cross-domain probes ("parlay bet embarrassing 5-0"), and catch-alls ("everything you
know", "user"). **Zero leaks.** An unrelated `user_id` returns 0 rows for chess queries.

The unsafe path is the opposite one: `user_id: null` with no `group_ids` returns everything in the
app — the chess probes pulled back betting memories from an unrelated experiment. Today's code is
safe only because `group_ids` is doing the isolation work. Any change must keep one real scope.

`user_id` + `group_ids` together drops episodes again — the group filter wins.

## Other API notes

- `include` accepts exactly `'fact'`, `'artifact'`, `'episode'` (anything else → HTTP 422).
  `'artifact'` returned nothing in any lane.
- `GET /v1/memories` exists and returns 200, but **ignores `group_ids`** — all four groups
  returned an identical app-wide census. Useful for debugging, not for scoped reads.
- `mode: 'compose'` returns an assembled `context` markdown block that includes memories absent
  from its own `data` rows, and gives episodes readable headings. The client hardcodes
  `mode: 'retrieve'` (`packages/companion/src/xtrace/client.ts:173`).
- Under `user_id` scoping at this corpus size, the query text did not change the result set — the
  same rows came back for every query, i.e. it behaves as "this user's memories" rather than a
  ranked search. Expect ranking to matter at larger scale.

## Measured: blind A/B/C through the actual commentary workflow

The above is retrieval-side. To check it actually improves output, the same writer prompt was fed
each path's context and the results were graded blind (2 samples per path, 3 independent judges
with different lenses — pattern coverage, insight, broadcast quality — none told which retrieval
system produced which text, and grading only the prose).

| | A: group-scoped retrieve (today) | B: `userId` retrieve | C: `userId` compose |
| --- | --- | --- | --- |
| planted patterns conveyed | 3 (K5, P1, P5) | 6 (K1, K2, K4, K5, P1, P5) | **7** (K1, K4, K5, P1, P2, P4, P5) |
| specificity (1-5) | 3.00 | **5.00** | 4.33 |
| insight (1-5) | 2.00 | 3.67 | **4.83** |
| broadcast quality (1-5) | 2.67 | 3.67 | **5.00** |
| grounding verdict | minor_drift | minor_drift | minor_drift |

**All three judges independently picked the same path-C variant as best, and path A as worst.**

The qualitative gap is stark. Path A, on Kestrel:

> Across the board, Kestrel. The file is one line long: a win streak running since at least
> June 20. No opponents named, no openings logged.

The commentary is reduced to narrating its own lack of data. Path C, same player, same writer:

> Kestrel arrives on a three-game winning streak dating back to June 20, and hasn't opened with
> anything but 1.e4 since the start of June. Expect the fourth. … Kestrel does not need to win
> this. Kestrel needs only to still be there on move 40.

Grounding was equivalent across all three paths — no path hallucinated. Every flagged item was
either shared framing from the writer prompt rather than memory (the auditors saw only the MEMORY
block, so "she has Black" and "first meeting" read as unsupported — a harness artifact, not a
model failure) or small embellishment present in all paths equally. Notably path A produced the
one *completeness* error, implying two games were Priya's only recorded White games.

Two patterns were never conveyed by any path: K3 (clock trouble) lives in a May episode this
query didn't rank, and P3 (early queen sorties) was never extracted at all.

### `COMPANION_SEARCH_LIMIT` starves episodes

Path B scored identically to A for Priya, because the API returns **all facts first, then
episodes**, and the client slices to 8 after the fact (`client.ts:190`). Priya's first episode sits
at index 9, so `slice(0, 8)` discarded 3 of 3 episodes; Kestrel only benefited because he had a
single fact. **Passing `userId` alone is therefore not sufficient** for any player with ≥8 facts —
it needs `mode: 'compose'`, or a type-balanced selection (e.g. 5 facts + 3 episodes), or a raised
limit.

## The filler is not noise — it is the color

Worth recording, because it contradicts an assumption two earlier harness versions were built on.

The stress corpus is ~90% deliberate filler (refs, wings, pad thai, "coffee number four"). v5
tried cleaning that away with an LLM pass before ingestion, on the theory that xTrace would
extract better from pure signal. That lane scored **worst of all — 2/10**, below even the
unmodified group lane.

The v6 episode lanes explain why. xTrace builds episodes by summarizing whole conversations, and
those summaries carry the planted facts *wrapped in the texture around them*:

> ...side comments about a broken sleep schedule, missing leftovers, and celebrating seven in a
> row like a crown-worthy streak.

The streak (a planted fact) is in there, but so is the voice. Strip the filler and you do not get
a cleaner fact — you get no episode worth retrieving, because there is no conversation left to
summarize. Cleaning removed exactly the material episodes are made of.

This matters directly for generation quality, not just retrieval: "celebrating seven in a row
like a crown-worthy streak" gives a writer something to work with in a way that
`streak_length: 7` never will. The banter and recap surfaces want the mess.

Practical consequence: **do not pre-clean conversational input**, and prefer prose over structured
notation (which is the same lesson as raw PGN scoring 0 facts across 8 complete games). Clean up
input only where it is genuinely unparseable, not where it is merely informal.

## Position-keyed retrieval (per-move commentary)

Separate experiment, same store: can xTrace answer *"what did this player do in a similar
position?"* — the retrieval shape per-move commentary needs, where the key is the POSITION TYPE
rather than the player.

Setup: 16 decision points for one player across 4 archetypes (isolated queen's pawn,
opposite-side castling, rook endgame, closed centre), 4 each, with a consistent and different
tendency per archetype. Each ingested as its own short post-game review in natural-language
chess terms — never FEN or movetext. Then probed with 4 *fresh* positions the player had never
been in, and scored on precision@5 against a 0.25 base rate.

| mode | IQP | opposite | rook | closed | **mean precision@5** |
| --- | --- | --- | --- | --- | --- |
| `retrieve` | 0.80 | 1.00 | 1.00 | 0.20 | **0.75** |
| `compose` | 1.00 | 1.00 | 1.00 | 1.00 | **1.00** |

All four probes returned distinct top-5 orderings, so the query genuinely drives ranking. (An
earlier probe suggested user-scoped search ignored the query and returned a fixed per-user dump;
that was an artifact of a 9-memory corpus, not general behaviour.)

Extraction also induced the *tendency* across games, which is the part commentary actually needs:

> Kestrel uses an opposite-castling pawn storm strategy in chess games.
> Kestrel starts the pawn storm on move 12 before completing development.
> The passive first-rank defence in rook endings is a decision point worth logging.

None of those is stated in any single ingested review.

**Constraints, measured.** Latency is ~1.0 s (`retrieve`) / ~1.7 s (`compose`) per search, so this
cannot block a move in a live game — prefetch on position-type change, or render a beat late.
Recall is partial: only 6–8 of the 16 decision points surfaced per probe, so this is a color
layer, never an authoritative move history. And the one weak cell (closed centre, 0.20 under
`retrieve`) shows discrimination tracks how distinctive the vocabulary is — "blocked structure"
overlaps far more with other archetypes than "isolated queen's pawn" does.

**What makes it work is not xTrace.** It is the position → natural-language translation, which
has to be deterministic and use a controlled vocabulary shared by ingest and query. Derive the
phrases from the board state (structure, phase, castling, material imbalance, the move actually
played, the alternative declined, the outcome) and keep that translation in your own code; the
authoritative move record stays in your own store.

### vs a real SQL semantic baseline

The earlier FTS baseline was lexical, so it was never a fair test of semantic retrieval. This one
is: the identical 16 decision points and 4 probes, embedded with `BAAI/bge-small-en-v1.5`
(384-dim, run locally) into **pgvector 0.6.0**, ranked by cosine distance.

| system | mean precision@5 | end-to-end latency | decision-point coverage |
| --- | --- | --- | --- |
| xTrace `retrieve` | 0.75 | ~1045 ms | 11/16 |
| xTrace `compose` | **1.00** | ~1710 ms | 11/16 |
| pgvector, per-document | 0.75 | **~10 ms** | **16/16** |
| pgvector, per-sentence | 0.65 | ~10 ms | **16/16** |

Base rate is 0.25. Sentence-chunking *hurt* — short fragments ("Another rook ending a pawn down
for Kestrel.") match too many probes.

On the numbers that look like a search benchmark, SQL wins decisively: it ties xTrace's
`retrieve` precision, is ~100× faster, and never loses a record. xTrace's extraction dropped 5 of
16 decision points outright, and lossy extraction is not recoverable downstream — a decision point
that never became a memory cannot be retrieved by any query.

**But precision@5 measures the wrong thing for this use case.** The two systems return different
kinds of object. SQL returns the source documents; xTrace returns 28 memories for 16 inputs, of
which **9 are generalizations that appear in no single document**:

> Kestrel uses an opposite-castling pawn storm strategy in chess games.
> Kestrel starts the pawn storm on move 12 before completing development.
> Kestrel aims to break through first in opposite-castling races.

That is the commentary. "Kestrel starts the pawn storm on move 12" is a claim about a *player*,
induced across four games; no document says it, so no retrieval over those documents can return
it.

The honest caveat: a generation-time LLM handed SQL's four opposite-castling documents could
induce the same tendency itself. So xTrace is not buying a capability that is otherwise
unreachable — it is **pre-computing the induction at ingest time instead of paying for it per
request**, in exchange for ~100× latency, 5/16 lost records, and non-determinism.

Which is the right trade depends on the surface. For per-move commentary in a live game, SQL's
10 ms and total recall matter more than pre-computed synthesis, and the generation call is
already happening anyway. For a season recap or a weekly banter panel — cached, latency-tolerant,
and specifically wanting "what is this player *like*" — the pre-computed induction is the product.

The strongest configuration is not either alone: **pgvector for the position lookup** (fast,
complete, deterministic) **plus xTrace for the player-level tendencies** (the part that reads as
insight rather than history).

## Revisiting the betting result against pgvector

The v6 harness reported xTrace 8/10 vs "Postgres 4/10", but that baseline was **FTS — lexical
only**. Re-running the identical 159-message corpus and the identical 10 queries against real
embeddings (`BAAI/bge-small-en-v1.5` in pgvector), scored by the same marker rules:

| lane | T1 lexical | T2 paraphrase | T3 inference | **all** |
| --- | --- | --- | --- | --- |
| xtrace-group (app's path before this work) | 1/3 | 1/3 | 1/4 | 3/10 |
| xtrace-cleaned | 0/3 | 1/3 | 1/4 | 2/10 |
| xtrace-user (flat top-k) | 1/3 | 2/3 | 1/4 | 4/10 |
| xtrace-user-balanced | 2/3 | 3/3 | 1/4 | 6/10 |
| **xtrace-user-compose** | 2/3 | 3/3 | **3/4** | **8/10** |
| postgres FTS (old baseline) | 2/3 | 1/3 | 1/4 | 4/10 |
| pgvector, per-message | 2/3 | 2/3 | 1/4 | 5/10 |
| pgvector, per-author-week batch | **3/3** | 2/3 | 1/4 | 6/10 |

**The 8-vs-4 headline was inflated by a weak baseline.** A fair semantic baseline scores 6/10, so
the real margin is 8 vs 6, not 8 vs 4 — and pgvector answers in ~11 ms end-to-end against
xTrace's ~1.7 s.

The margin that survives is concentrated entirely in one tier:

- **T1 (facts stated in one message): pgvector wins**, 3/3 vs 2/3. Embeddings handled the
  "lakers rematch on tv" distractor that beat FTS.
- **T2 (paraphrase): xTrace wins**, 3/3 vs 2/3.
- **T3 (inference across messages): xTrace wins decisively**, 3/4 vs 1/4 — the same 1/4 as FTS.

So a vector index is not a substitute on the queries that need consolidation, and xTrace is not
worth 150× the latency on the queries that don't.

Two mechanisms show up in the misses. Q10 ("how long have dex and mo been rivals") is *stated* in
the corpus — "third season running against the same guy. we should get married at this point" —
and **both** SQL lanes missed it while every xTrace lane hit. Extraction had normalized the joke
away into "Dex is in a third season running against the same guy", which is retrievable; the
original is not. Q8 (mo's *current* strategy) was hit only by compose, because it requires
knowing the chalk switch superseded the fading strategy — ordering that no single message states.

Batch-level embedding beat message-level (6/10 vs 5/10), the same direction as the chess result
where per-document beat per-sentence: more surrounding context per vector is better, and
chunking finer is a false economy.

## Supersession test (food domain)

The claim under test: xTrace's edge is knowing a user's **current** preference when it has
changed, where a similarity search retrieves the higher-volume stale signal instead.

39 orders over 8 months for one diner, with three deliberate reversals — each weighted so the OLD
preference has MORE records than the new one — plus one stable aversion as a control:

| | old (more records) | current |
| --- | --- | --- |
| dairy | heavy, 11 records | avoids, 7 records |
| spice | mild, 7 | very hot, 6 |
| venue | Nonna's, 9 | Saffron House, 5 |
| olives (control) | — | dislikes, stable throughout |

Same corpus into both systems. A verdict of `current` means the retrieved set contains
current-supporting evidence and NO stale evidence — a consumer cannot get it wrong. `mixed` means
both, so the consumer has to infer recency itself and may get it wrong.

| lane | reversals correct | mixed | control | states the change |
| --- | --- | --- | --- | --- |
| xtrace `retrieve` | 2/3 | 1 | pass | 2/4 |
| **xtrace `compose`** | **3/3** | 0 | pass | **4/4** |
| pgvector per-order | 1/3 | 2 | pass | 2/4 |
| pgvector per-month | 0/3 | 3 | pass | 4/4 |
| **pgvector + recency weighting** | **3/3** | 0 | pass | 1/4 |

**Plain semantic search does fail supersession** — 1/3 and 0/3, returning a mix of current and
stale evidence on every reversal. That part of the hypothesis held.

**But recency weighting fixes it, in one line of SQL.** `ORDER BY (1 - (emb <=> q)) + 0.06 * month`
scores 3/3. So "which preference is current" is *not* a decisive xTrace advantage — it is a cheap
ranking fix, at ~11 ms.

What recency weighting does **not** produce is the *transition itself*: 1/4 versus compose's 4/4.
SQL returns "Coconut milk ice cream is better than the dairy version" — correct, current, and
silent about the fact that anything changed. xTrace returns:

> User now eats dairy-free as a lasting habit, not as a phase.

and titles its episodes "Settling into dairy-free favorites and a new go-to restaurant" and
"Recurring Saffron House orders and escalating spice tolerance". "Escalating spice tolerance" is
the induced trajectory across eight months; no record contains it.

So the decisive use case is narrower than "knowing the current preference". It is **the
explanatory layer** — copy that can say *what changed, when, and in which direction*. That is
recap, "we noticed you switched", and reason-why text. The recommender's own filter should be
SQL + recency: faster, complete, deterministic.

### The one-off deviation risk did NOT reproduce

The obvious objection to recency weighting is that it cannot tell a genuine reversal from a single
recent anomaly. Tested directly: the same corpus plus ONE dairy order in month 8 — the most recent
record, so recency weighting gives it maximum boost — in two flavours. `regretful` marks itself as
an exception ("two days of regret, worth it exactly once a year"); `neutral` states it flatly
("had a slice of the cheesecake at the birthday dinner tonight") and is the harder case, since
only the weight of prior history argues against a flip. Ground truth in both: still avoids dairy.

**Every lane held.** No lane flipped, and no lane even reached `at-risk`:

| lane | regretful | neutral |
| --- | --- | --- |
| xtrace `retrieve` | robust (5 dairy-free, deviation absent) | robust (4, deviation absent) |
| xtrace `compose` | robust (8, deviation absent) | robust (14, deviation at 15) |
| pgvector plain | robust (5, deviation absent) | robust (5, deviation absent) |
| pgvector + recency | robust (3, deviation at 3) | robust (3, deviation at 5) |

And the recency weight turns out not to be a tuned knob: swept from 0.00 to 0.30, the top-5 never
drops below 2/5 dairy-free evidence and the deviation never reaches rank 1. The fix is not fragile
in the way I guessed.

Two observations worth keeping:

- xTrace's phrasing is supersession-aware unprompted — "User is **still** eating dairy-free",
  "User **no longer** treats the dairy thing as a phase". That is the property doing the work, and
  it is more robust than a ranking constant because it does not depend on record volume at all.
- xTrace `retrieve` never surfaced the deviation. Correct for a recommender, wrong for a recap:
  the person *did* eat dairy once, and a food diary that silently omits it is losing a real
  record. `compose` handled this better, including it at rank 15 of a block otherwise dominated by
  dairy-free evidence — present but correctly de-emphasised.

Scoring note: the compose lane initially scored `at-risk` because the whole assembled block was
counted as a single item, so "1 item matched" was read as "1 piece of evidence" and the deviation
was necessarily "rank 1" in a one-item list. Scoring within the block instead gives 8 and 14
pieces of dairy-free evidence. The corrected splitting is in `food-deviation-judge.mjs`.

### Methodology correction

The first scoring pass was wrong in both directions and had to be fixed. Markers derived from the
*source* phrasing systematically penalised paraphrase: "User avoids olives at work events" is
exactly right but matched no source-derived pattern, failing xTrace's control. And "medium heat
was too mild" was counted as *stale* evidence when it argues for more heat. Records mentioning the
old preference while reporting it going wrong ("Nonna's messed up the order twice") were likewise
counted as stale when they are what motivates the switch.

Correcting these moved `xtrace-compose` from 1/3 to 3/3 and repaired its control — i.e. the fix
moved results in xTrace's favour, which is the direction that warrants the most suspicion. The
corrected judge is in `food-judge.mjs` with the exclusion patterns stated explicitly, and the
underlying retrieved items are in the JSON outputs for anyone who wants to re-grade them.

## Negative result: structured-lesson stripping does NOT destroy retrieval value

Tested a specific piece of advice and found it wrong, so recording it here.

The claim under test: a product that extracts each record on-device into a fixed five-field
structured lesson (`{place, signal, driver, cadence, weight}`) and stores only that, rather than
the original prose, throws away what makes memory extraction valuable — reasoning by analogy from
the v5 pre-cleaning lane, which scored worst (2/10).

Corpus: 30 first-person food confessions over 6 months for one user, with seven planted patterns
stated in no single record, including a supersession (appetite collapses after starting a
medication, with the OLD preference carrying more records) and an interaction (orders larger and
spicier when observed, and regrets both). 2×2 over representation × substrate:

| lane | probes hit | hard probes |
| --- | --- | --- |
| prose → xTrace (the proposed change) | 8/8 | 2/2 |
| lesson → xTrace | 8/8 | 2/2 |
| prose → pgvector | 8/8 | 2/2 |
| lesson → pgvector (as-designed proxy) | 8/8 | 2/2 |

**No lane distinguishes itself.** Three corrections fall out of this:

1. **Stripping to a fixed schema did not lose the signal.** The lesson lanes matched the prose
   lanes. An expressive enum (`driver: social_performance`) carries the induced mechanism perfectly
   well.
2. **"An interaction between records cannot live in a per-record schema" was wrong.** Tag each
   record with the driver and the interaction is a `GROUP BY`. I asserted otherwise; it is false.
3. **An apparent xTrace advantage on the hard probes was a payload-size artifact.** With pgvector
   capped at top-5 while compose returned 14–28 lines, xTrace looked 2/2 against 1/2. Raising
   pgvector to top-20 — comparable surface area — erased the gap entirely.

Caveats that matter as much as the result:

- **Ceiling effect.** 8/8 everywhere means the benchmark cannot discriminate. Thirty records with
  3–5 lexically-close supporting records per pattern is too easy; every configuration finds
  everything. A discriminating test needs a much larger corpus with distractors, or probes whose
  answers require ordering and counting across records rather than locating them.
- **The lessons were written by hand, by someone who knew the probes.** That is a leak: it grants
  the stripped lane an ideal taxonomy. Whether an on-device extractor invents one that good,
  before knowing what will be asked, is the real open question — and it is the actual product risk,
  not the representation.
- **A third scoring artifact.** `pgvector-lesson` initially missed the portion probe because
  `/small(er)? portion/` cannot match `ordered_small_portion`. The correct rows were ranked 1, 2, 5
  and 6. Source-phrasing regexes keep under-crediting whichever lane paraphrases or reformats —
  every artifact found in this work has had that shape.
- **Run-to-run variance.** The same prose lane scored 7/8 then 8/8 on identical input and queries.

The one concern not settled: the as-designed product encrypts the lesson so xTrace cannot read it,
which precludes consolidation. `lesson → pgvector` is only a proxy for that lane — the real one
needs the encrypted-vector API, which was never exercised here.

## Encryption claims, tested

Prompted by a proposal that encrypts records client-side, extracts a structured "lesson" on
device, and pools only the lesson — declaring xTrace's encrypted-vector product the one
dependency it will never cut.

**Extraction cannot run on ciphertext. Measured.** Six confessions encrypted with AES-256-GCM
(the scheme specified) and ingested as message content, against the same six in plaintext:

| lane | memories extracted |
| --- | --- |
| ciphertext | **0** |
| plaintext | **11** (10 facts + 1 episode) from 6 records |

So "xTrace cannot decrypt it" and "xTrace supplies our procedural memory and belief revision"
cannot both be true of the same data. Whichever content is encrypted is content xTrace contributes
nothing to beyond storage.

**x-vec is real, but not on the REST API.** The docs do describe it — *"your embedding vectors are
homomorphically encrypted before they leave your machine. The server stores and searches over
ciphertexts"* — so the capability exists and an earlier doubt here was wrong. But every candidate
REST route 404s (`/v1/x-vec`, `/v1/vectors`, `/v1/encrypted/search`, and nine more), there is no
served OpenAPI spec, and the documented endpoint list is Groups / Memories / Usage / Webhooks with
no x-vec route. The documented usage is a separate SDK surface (`DataLoader`, `Retriever`,
`execution_context`), shown in Python.

**Mainline search cannot take a precomputed vector.** `query` is a required field; passing
`vector`, `embedding`, `query_vector`, `query_embedding` or `encrypted_vector` all return 422
`{"field":"query","message":"Field required"}`. Client-side embedding therefore cannot be used
against `/v1/memories/search` at all — it requires the x-vec path.

**Cross-user pooling under homomorphic encryption looks unsupported**, and not only per the docs
("per-user execution contexts", an AES key that "never leaves your environment"). It is a
cryptographic constraint: standard HE cannot compute similarity between vectors encrypted under
*different* keys. Any design whose headline moment is "user A's encrypted record is found by user
B's encrypted query" needs multi-key HE, which is not what is described.

**A new primitive worth knowing about:** `POST /v1/memories/trigger` exists — procedural-memory
recall, a pre-tool-call hook. It requires `action` as an object (`{tool, input}` returns 200;
strings and `{name, arguments}` are rejected) and returns memories of `type: "lesson" |
"procedure"`. The standard `/v1/memories` ingest produces only facts and episodes, so procedures
and lessons are written by some other path. This corrects an earlier note here that
`fact`/`artifact`/`episode` were the only memory types — they are the only types the *search*
endpoint's `include` accepts, which is a narrower statement.

## Suggested follow-ups

1. ~~Make `banter.ts` and `callout-draft.ts:83` pass `userId`~~ — **done**. `banter.ts` now runs
   both legs (group for shared pairing facts, user for episodes) and `callout-draft.ts` /
   `companion-season-recap.ts` reserve `episodeSlots`. One correction to the original suggestion:
   the user leg is scoped to the **viewer's own** profile, not the opponent's. A profile's
   user-scoped memories span all of their rivalries, so reading the opponent's would surface
   their other matchups to this viewer — the group leg is the correct channel for shared context.
2. Prefer prose over structured notation at ingest, and do not pre-clean it (see above).
3. Re-voice retrieved memories before use — xTrace returns second-person advice, and the
   `RECORD`-authoritative rule in `packages/companion/src/prompts.ts` still applies.
4. `mode: 'compose'` is now available via `XtraceClient.searchContext` but **no production
   surface uses it yet**. It measured best (8/10 on the stress corpus, and best on insight and
   broadcast quality in the blind A/B), so it is the obvious next step — but it adds a
   server-side LLM pass and has not been validated end-to-end in-app. `companion-season-recap`
   is the natural first adopter: batch job, no request-path latency, and the surface that most
   needs season-spanning material.

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

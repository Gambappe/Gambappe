# WS26 — CPU Nemesis: plan + work breakdown

Spec home for the `WS26-T*` tasks in the workstream lock registry
(`node scripts/workstream-lock.mjs list-ready`). Canonical over the registry's condensed
notes and over the earlier xTrace RFC draft. Follows the design doc's §0 / §19.4
cross-cutting rules: one task per PR, `pnpm verify` gate, contract-change PRs for
`packages/core` / `packages/db` marked as such.

Related design-doc sections: §8.4 (nemesis matchmaking), §8.8 (nemesis surfaces),
§9.3 (crowd visibility), §15.2 (curation), plus `profiles.bot_score` /
`BOT_EXCLUDE_THRESHOLD` in `packages/core/src/config.ts`.

## Decision log

| Date | Decision |
|---|---|
| 2026-07-22 | Owner: **CPU ratings DRIFT** (not pinned). `ratings:weekly` applies Glicko-2 to the CPU side exactly as to humans; human ratings also move from CPU matchups (the picks are real). See T12. |
| 2026-07-22 | Flag name canonicalized to `FLAG_CPU_NEMESIS` (the RFC draft's `FLAG_NEMESIS_CPU` is superseded). |
| 2026-07-22 | Review pass accepted in full (see "Review corrections" below), T12 pinned→drift excepted. |

## 1. Problem

Nemesis (`FLAG_NEMESIS`) needs two eligible humans (`NEMESIS_MIN_PICKS` graded picks each)
plus the weekly `nemesis:assign` batch to produce a pairing. That fails in three real
situations:

1. **Solo / early dogfood** — one active player, no rival to pair with.
2. **Onboarding week** — a new user has no matchup until they clear the pick minimum *and*
   the next weekly assignment runs; the marquee feature is dark for their first ~week.
3. **Thin liquidity** — an odd eligible pool leaves one human unmatched every run
   (`matchmaking_priority` carries them forward, but they still wait).

A CPU rival fills all three without waiting on human supply.

## 2. Design

A CPU is a **profile with `kind = 'cpu'` and `bot_score = 1.0`**. The
`bot_score ≥ BOT_EXCLUDE_THRESHOLD` convention already excludes such profiles from the
human matcher pool, the crowd-at-lock snapshot (`lockQuestionTx` filters
`bot_score < BOT_EXCLUDE_THRESHOLD`), and public leaderboards — by construction, not by
special-casing. The positive `kind='cpu'` marker makes every *new* downstream filter
(metrics exclusion, UI badge, the pick job's target query) a one-predicate check instead
of a magic-number threshold.

Because a high-`bot_score` profile is excluded from the normal matcher, the CPU is
injected through the existing **forced-pairing** path: `matchNemeses` stays human-only and
already emits `leftoverProfileIds`; the `nemesis:assign` *job* appends CPU pairings for
leftovers. The CPU never enters the human pool; it only fills.

**Personas.** The matcher input `NemesisPoolEntry extends StyleInputs` — the same axes as
a human fingerprint. A CPU persona is a point in that space plus a pick policy:

| Persona | Style lean | Pick policy (per open question) |
|---|---|---|
| The Chalk | high `chalk` | take the favorite side (implied prob > 0.5) |
| The Fade | high `contrarian` | take the **priced underdog** (fade the *market* favorite — never the hidden crowd; see review correction 2) |
| The Longshot | `contrarian` + timing | buy the side with implied entry ≤ `LONGSHOT_THRESHOLD` |
| The Clock | high `timing` | pick late, near lock, off the freshest price |

**Pick execution.** A `cpu:pick` **cron sweep** (see review correction 1 — not
event-triggered) finds open daily+bonus questions in active CPU pairings lacking a CPU
pick, reads the current stamped price, applies the persona policy, and places through the
same `placePickTx` path a human uses (`source='cpu'`) — grading, streaks, settlement, and
reveal treat it identically with zero new plumbing. Picks are pre-lock, at the genuine
venue price, with no outcome lookahead.

**Ratings (drift).** CPU pairings flow into the normal `nemesis:conclude` →
`ratings:weekly` pipeline with **no CPU exemption**: the CPU's rating drifts to its
persona's natural level and the human's rating moves from CPU matchups like any other.
Consequences threaded through the tasks: band-fit selection (T8) must read **live**
ratings at assign time, and persona refinement (T9) must target believability — not
win-rate correction — so it doesn't fight Glicko's own calibration.

**xTrace (Phase 2).** Each persona is a stored procedural skill:
`inputs {category, implied_price, time_to_lock, own_recent_record} → {side | skip}`,
refined from graded outcomes (dampened toward believable variance). Tuning is memory, not
code — no redeploys — and personas become importable/exportable rivals.

## 3. Integrity guardrails (non-negotiable, threaded through the ACs)

- **Visible bot badge** everywhere a CPU appears (matchup, assignment, profile, verdict).
- **Excluded from real metrics** — crowd-at-lock and leaderboards (existing `bot_score`
  filters, pinned by test in T7) **plus** DAU/retention rollups, analytics events, and
  participation counts (T7).
- **No informational edge** — personas see only what a human sees at pick time: venue
  price and clock. Never the raw pre-lock `yes_count`/`no_count` (§9.3 hides them from
  humans).
- **Fill only** — one CPU per unmatched human; CPUs never flood a question or manufacture
  a crowd.
- **No deceptive messaging** — CPUs never post threads or DM as if human.

## 4. Tasks

Registered in the lock registry as `WS26-T1` … `WS26-T13`. Phases: X0 (house bot —
unblocks solo dogfood), X1 (roster/believability), X2 (procedural memory).

### Phase X0

| Task | Layer | Scope | Deps |
|---|---|---|---|
| **T1** `[contract-change]` | core+db | `FLAG_CPU_NEMESIS` (default off); `profile_kind += 'cpu'`; `pick_source += 'cpu'`; pg-enum migrations. | — |
| **T2** | engine | Pure `decideCpuPick({persona, category, impliedPrice, timeToLockMs}) → {side}\|{skip}`. **No crowd input.** Unit-tested, DB-free. | T1 |
| **T3** | db | CPU repos (`listActiveCpuPairingsWithOpenQuestion`, `getCpuPersona`) + roster seed: test factory **and** a real-environment seed step (deploy checklist). | T1 |
| **T7** | db/analytics | Metrics guardrail: exclude `kind='cpu'` from DAU/retention rollups, analytics events (`pick_created` etc.), and participation metrics; pin existing leaderboard/crowd exclusion with tests. **Merges before the flag is enabled anywhere metrics are read.** | T1 |
| **T4** | worker | CPU-fill in `nemesis:assign`: force-pair each `leftoverProfileId` with a rating-fitting CPU via `insertNemesisPairingRow`, behind the flag. ACs: notification loop **skips CPU recipients**; CPU-filled humans do **not** get `matchmaking_priority`; one CPU per unmatched human. | T1, T3 |
| **T5** | worker | `cpu:pick` **cron sweep** over open daily+bonus questions in active CPU pairings lacking a CPU pick; stamps `yesPriceAtEntry`/`priceStampedAt` replicating the web pick route's price ladder (shared helper or careful replication — sized accordingly); places via `placePickTx` `source='cpu'`; idempotent via the pick unique constraint. | T1, T2, T3 |

### Phase X1

| Task | Layer | Scope | Deps |
|---|---|---|---|
| **T6** `[contract-change]` | web | Payloads expose `opponent_is_cpu` + persona label; matchup/assignment cards and profile header render a CPU chip; e2e asserts it is always visible. | T3, T4 |
| **T12** | engine/worker | Rating semantics = **drift** (owner decision): make the symmetric Glicko application explicit and pin with tests; document roster-spread consequence. Lands before T8. | T4 |
| **T8** | worker | Roster + band-fit fill: select the CPU whose **current** rating sits within `NEMESIS_BAND_BASE` of the human. | T3, T4, T12 |
| **T13** | web+api | Rematch vs CPU: hide the CTA or auto-accept (decide in-task); no dangling pending requests addressed to a CPU. | T4 |
| **T11** | test | Golden loop e2e: solo human → assign → CPU-fill → open → sweep → lock → settle → reveal → verdict vs a badged CPU. AC: define what a CPU `skip` means for the verdict. | T4, T5, T6 |

### Phase X2

| Task | Layer | Scope | Deps |
|---|---|---|---|
| **T9** | worker+engine | Outcome-driven persona refinement toward believable variance (not rating correction — see drift note). | T2, T5 |
| **T10** | ops | xTrace wiring: personas as cloud-stored skills; save/load; import/export. | T9 |

**Critical path:** T1 → T3 → T4 → T5. Smallest slice that unblocks solo dogfood:
T1 + T2 + T3 + T5 with a hand-created CPU pairing (defer T4's auto-fill).

## 5. Review corrections (2026-07-22, verified against code — the record)

1. **T5 trigger**: bonus questions are created already-`open` in `nemesis-assign.ts` —
   `question:open` never fires for them, so an open-triggered pick job would silently skip
   half of every matchup. Hence the cron sweep (which also enables The Clock's late picks).
2. **Fade would have cheated**: the draft fed `decideCpuPick` a `crowdLean` input, but raw
   pre-lock crowd counts are hidden from humans (§9.3; the serializer only exposes the
   bot-filtered at-lock snapshot). Personas see price + time only; The Fade fades the
   market favorite.
3. **Assign job would notify the bot**: `sendNemesisAssignedNotifications` loops both
   pairing sides; CPU recipients must be skipped.
4. **`matchmaking_priority`**: a CPU-filled human is matched *now* and must not also carry
   next-week priority.
5. **T7 broadened** beyond DAU/retention to analytics events and participation metrics.
6. **T12 added** (rating semantics; owner chose drift), **T13 added** (rematch vs CPU).
7. **T3** needs real-environment seeding, not just a test factory. **T11** must define
   CPU-skip verdict semantics. **T5** must replicate the web route's price-stamping ladder.
8. Flag name canonicalized to `FLAG_CPU_NEMESIS`.

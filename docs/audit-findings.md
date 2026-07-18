# Receipts — Audit Findings Log

**What this is.** A durable, read-only audit of the Receipts monorepo against its own specs
(`receipts-prd.md`, `receipts-principles.md`, `receipts-design-doc.md`). It records verified
gaps between spec and code for the team to act on **after** the §19 work breakdown is complete.
It is a living work log, **not** a task queue — nothing here needs a workstream-lock claim to
pick up later, and no ordering/urgency is implied beyond the severity labels.

**Audited against.** `origin/main` @ commit `7b10793` (feat(ws7-t10) …), 2026-07-18.

**Scope note.** Findings are only recorded for code that has **merged to main**. Tasks still
`available`/`claimed`/`in_review` at audit time (WS5-T2/T3/T4/T5, WS6-T3/T4, WS7-T6/T7/T8/T9,
WS8-T2/T4/T5, WS9-T4, WS14-T1..T4) are legitimately not built yet and their absence is **not**
flagged. Several findings below are "stale SPEC-GAPs": a comment deferring work to a dependency
that **has since merged**, so the gap is now closeable for real.

**Severity key.** `blocker` = ships broken / data-loss / security. `major` = real spec
violation or integrity/privacy gap, usually latent behind a flag. `minor` = correctness/robustness
nit with limited blast radius. `nit` = cosmetic / telemetry / cleanup.

**How it was produced.** Full read of the three spec docs, then eight cross-checking passes
(percentile bot-exclusion, rate limiting, notifications, engine math, API-contract drift,
grading/streak/reveal pipeline, SPEC-GAP staleness, and an invariants/deletion/security personal
pass). Each finding was traced through its full code path and reconciled against existing tests
before recording.

---

## 1. Publication rule & reveal (highest-value)

### 1.1 Settled outcome leaks on spectator SSR pages before the synchronized reveal — `major`
- **Files:** `apps/web/lib/question-view.ts:~111` (`toQuestionPublic` copies `outcome` /
  `revealed_at` / final split off the raw question row with no reveal gate); consumed by
  `apps/web/app/q/[slug]/page.tsx` and `apps/web/app/page.tsx` (home).
- **Spec:** §6.5 publication rule ("every public and viewer-facing surface treats a
  graded-but-unrevealed **daily** question's picks as `pending` and defers all mutation to
  reveal firing"); §6.7 ("all public surfaces and APIs keep the question in `locked` presentation
  until reveal"); §9.3 ("percentiles/results never leak pre-reveal … including via profile pages").
- **Failure scenario:** A daily question settles at, say, 13:00 ET (grading writes
  `questions.outcome`) but reveal is scheduled 20:00 ET. During that window the ISR-cached
  `/q/[slug]` and `/` server render the actual `outcome`/final crowd split, so anyone loading the
  spectator page sees the result ~7h before the designed synchronized reveal (defeats P8, spoils
  the appointment moment, and is the exact leak §6.5/§6.7 exist to prevent). The JSON API
  serializer (`serialize-question.ts`) gates this correctly; the **page** serializer does not — so
  the two public read paths disagree.
- **Fix direction:** Make `toQuestionPublic` apply the same effective-state gate the JSON path
  uses — mask `outcome`/`revealed_at`/final-split to a `locked` presentation until
  `status = 'revealed'` (or `revealed_at <= now`), so both public read paths share one gate.

---

## 2. Rate limiting (§14.1)

Core limiter is sound — per-key isolation, `Retry-After`, and the fail-closed 25% in-process
fallback on Redis outage are all implemented and tested. The gaps are **unwired limits**: the
constant exists in `core/config.ts` but no route/middleware applies it.

### 2.1 `POST /reports` has no rate limit — `major`
- **File:** `apps/web/app/api/v1/reports/route.ts` (no `enforceRateLimit` call); constant
  `RL_REPORT_PROFILE_D` (10/day) defined but unused on this path.
- **Spec:** §14.1 table ("Reports | profile | 10/day").
- **Failure scenario:** A claimed profile can file unlimited reports, enabling report-spam of the
  moderation queue (and, combined with the auto-pause rule §14.3, amplifying harassment pressure).
- **Fix:** Apply `enforceRateLimit('reports', profileId)` in the reports handler.

### 2.2 `POST /claim` has no rate limit — `major`
- **File:** `apps/web/app/api/v1/claim/route.ts`; constant `RL_CLAIM_IP_H` (10/hour) unused.
- **Spec:** §14.1 ("Claim attempts | IP | 10/hour").
- **Failure scenario:** Claim endpoint can be hammered per-IP (case-A/B/C/D branching does DB
  work + cookie handling) with no throttle.
- **Fix:** Apply `enforceRateLimit('claim', ip)` (IP-keyed) in the claim handler.

### 2.3 Backstop GET limit (600/min/IP) is never wired — `major`
- **Where:** `RL_GET_IP_MIN` (600) defined; no middleware applies it to `/api/v1` GETs.
- **Spec:** §14.1 ("Any /api/v1 GET | IP | 600/min backstop"); WS11-T1 AC ("backstop GET limit
  doesn't hit ISR pages").
- **Failure scenario:** Uncached `/api/v1` GETs (e.g. `/reveal`, `/me`, thread reads) have no
  backstop ceiling — a scraper can pull them unbounded. The WS11-T1 acceptance criterion for this
  backstop is unmet.
- **Fix:** Add the GET backstop in the shared limiter middleware, scoped to `/api/v1/*` GET only
  (must exclude ISR public pages per the AC).

### 2.4 Auth email-send limit not applied to magic-link send — `major` (latent)
- **Where:** `RL_AUTH_EMAIL_H` (5/hour, email+IP) defined; not applied at the Auth.js magic-link
  send path.
- **Spec:** §14.1 ("Auth email sends | email+IP | 5/hour").
- **Failure scenario:** Magic-link requests aren't throttled → email-bombing a target address /
  Resend quota burn. Latent to the degree the email provider isn't fully wired, but the limiter
  hook is absent regardless.
- **Fix:** Enforce the email+IP limit in the sign-in/magic-link send route before dispatching.

### 2.5 Ghost-mint 429 omits `Retry-After` — `minor`
- **File:** `apps/web/lib/ghost-mint-limiter.ts` / mint path — the `RATE_LIMITED` response on
  mint-over-quota lacks the `Retry-After` header the other limits set.
- **Spec:** §14.1 ("429 with `Retry-After`").
- **Fix:** Attach `Retry-After` to the ghost-mint rate-limit response.

### 2.6 Unresolvable client IP collapses to a single `'unknown'` bucket — `minor`
- **Where:** pick/events paths use `extractClientIp(...) ?? 'unknown'` as the limiter key.
- **Failure scenario:** All requests with no resolvable IP share one bucket — either over-limits
  legitimate NAT-shared traffic or (if the header is stripped at the edge) lets attackers share a
  quota. Low-risk but worth a deliberate policy.
- **Fix:** Decide fail-closed vs per-connection fallback for missing IPs rather than one global key.

_Not bugs (verified):_ posts/reactions per-profile limits are defined but their endpoints
(WS7-T8) aren't merged yet — expected. Fail-closed fallback, per-key isolation, and `Retry-After`
on the wired limits are correct and tested.

---

## 3. Account lifecycle / privacy (§11.4)

### 3.1 Deletion never applies the nemesis mid-week exit rule — `major` (stale SPEC-GAP, now real)
- **Files:** `packages/db/src/repositories/account-deletion.ts:78-80` (SPEC-GAP: "WS5 doesn't
  exist in this wave"); `apps/web/app/api/v1/me/route.ts` DELETE calls `applyDuoMidWindowExit`
  (duo) but has **no** nemesis equivalent.
- **Spec:** §11.4 ("active pairing/duo → mid-week exit rule (§5.7)"); §5.7 pairing rule
  (deletion → early-conclusion-with-scoring if ≥1 shared question graded, else cancel).
- **Now-merged dependency:** WS5-T1 (assignment + pairing lifecycle) is merged, so active nemesis
  pairings can exist. The deferral rationale is stale.
- **Failure scenario:** A claimed user mid-nemesis-week deletes their account. The pairing is
  never concluded/cancelled (dangles `active`/`scheduled`), and because the weekly Glicko batch
  skips pairings with a `deleted` participant (§8.3), the surviving opponent gets **no** scoring
  or rating for the week — i.e. a losing player can erase a loss by deleting, the precise
  integrity hole the red-team closed for blocking. Latent while the `nemesis` flag is off, but
  live the moment nemesis ships.
- **Fix:** Wire an `applyNemesisMidWindowExit(...)` caller-side in `DELETE /me` mirroring the duo
  path, and close the `account-deletion.ts` SPEC-GAP.

### 3.2 Deletion does not scrub `analytics_events` — `major` (stale SPEC-GAP, now real; privacy)
- **File:** `account-deletion.ts:97-99` (SPEC-GAP defers the scrub: "no … integration exists yet
  in this wave (WS13/§16 scope)").
- **Spec:** §11.4 ("`analytics_events` rows for the profile scrubbed (`profile_id`, `ip_hash`,
  `ua_hash` nulled) — no 13-month behavioral trail survives erasure"); §11.5 retention table.
  This was an explicit RT-B red-team remediation.
- **Now-merged dependency:** WS13-T1/T2/T3 are merged; `analytics_events` exists and is populated
  by a real insert (`analytics.ts:17`, callers `emit-event.ts`, `/events` route, `reveal-fire.ts`).
- **Failure scenario:** A user deletes their account; their full behavioral trail (with
  `profile_id` intact, plus `ip_hash`/`ua_hash` inside the 7-day window) survives up to 13 months
  in `analytics_events`. Violates the stated erasure guarantee.
- **Fix:** During/after deletion, `UPDATE analytics_events SET profile_id=NULL, ip_hash=NULL,
  ua_hash=NULL WHERE profile_id = ?` (async is fine). The Sentry-deletion half may stay deferred
  until Sentry is wired, but the DB scrub is doable now with the merged table.

---

## 4. Notifications (§13.2)

Subsystem composes well end-to-end: dedupe-key idempotency (unique constraint + `ON CONFLICT DO
NOTHING`), DST-safe quiet-hours deferral, the marketing daily cap, the transactional exemption
(reveal/verdict bypass **both** quiet hours and the cap), per-kind opt-outs, HMAC unsubscribe
token correctly placed in `@receipts/core/server` (node:crypto, off the browser barrel) and
constant-time compared, and post-claim/explicit-tap push gating — all verified correct.

### 4.1 One-click unsubscribe mutates state on `GET` — `minor`
- **Files:** `apps/web/app/api/v1/notifications/unsubscribe/route.ts:~45-52` (GET shares the same
  `handle()` as POST); `apps/web/lib/notifications/unsubscribe.ts:~37`.
- **Spec:** §13.2 (List-Unsubscribe / one-click); general safe-method convention (§11.2 "GET
  endpoints never mutate").
- **Failure scenario:** Email security scanners, link prefetchers, and "unsubscribe preview" bots
  follow the `GET` unsubscribe link and silently opt the user out without any action by the user.
- **Fix:** Make the token-link GET render a confirm page (or one-time POST via
  `List-Unsubscribe-Post: One-Click`), so a bare GET fetch doesn't flip the preference.

---

## 5. Engine (§8)

Engine math is faithful to the spec: fingerprint metrics + shrinkage + per-axis prior blend,
Glicko-2 (golden vector passes at stated tolerances), style distance/complementarity zero-vector
guards, nemesis/duo matcher constraints & determinism, nemesis/duo scoring, the slot-based
chemistry definition (missing/void picks create no slot), synergy gate, and narration goldens all
check out.

### 5.1 Fairness telemetry mislabels expected-win-prob in non-canonical pair order — `nit`
- **File:** `packages/engine/src/nemesis-matcher.ts:~136, ~253`.
- **Spec:** §8.4 ("the function returns expected win probability per pairing … P12 target: 95% of
  pairings within expected 0.40–0.60").
- **Failure scenario:** When a pairing is emitted with profiles in non-canonical order (2-opt swap
  / forced pairing), the returned `expectedScoreA` is computed for the wrong side, so the fairness
  distribution the batch logs is skewed for those pairings. Telemetry-only — does **not** affect
  who is matched or any rating.
- **Fix:** Compute expected score against the canonical `profile_a` consistently, independent of
  emit order.

_Observations (not bugs):_ the WS4-T4 perf AC was relaxed from "1k pool < 5s" to `< 15s` in the
test — worth confirming it still reflects the intended bound. `PRIORITY_BONUS` is applied
non-stacking; the spec is ambiguous on stacking across multiple leftover runs — behavior is
defensible, just noting.

---

## 6. Percentiles & bot exclusion (§8.6)

The **asymmetry** is implemented correctly and tested: a bot-flagged profile
(`bot_score >= BOT_EXCLUDE_THRESHOLD`) is removed from other profiles' denominators but still gets
its own percentile ranked against the full set. Redis-miss recompute from Postgres is identical.
Lock-snapshot crowd counts exclude bots. Leaderboard eligibility gates are correct.

### 6.1 No boundary test at exactly `bot_score = 0.8` — `nit`
- **Where:** percentile/exclusion tests cover bot-in-pool asymmetry but not the exact-threshold
  case; comparison is `>=` (exclude) in code, matching §14.2 ("Score ≥ BOT_EXCLUDE_THRESHOLD").
- **Fix:** Add a test pinning that a profile at exactly `0.8` is excluded from others'
  denominators (guards against a future `>` regression).

### 6.2 Weekly leaderboard window omits bonus-question picks — `minor` (SPEC-GAP, latent)
- **File:** `packages/db/src/repositories/leaderboards.ts:~47` (window filters to daily
  `question_date` only).
- **Spec:** §8.12 ("bonus questions included by their `lock_at` date").
- **Failure scenario:** Once nemesis/duo bonus questions exist, a profile's bonus wins/edge won't
  count toward the weekly category boards. Latent until bonus questions ship (WS5-T2/WS6). Flagged
  in-code as a SPEC-GAP already.
- **Fix:** Include `nemesis_bonus`/`duo_bonus` picks keyed by `lock_at` date in the leaderboard
  window when those question kinds land.

_Perf note (not a bug):_ the reveal viewer-block path recomputes a bot-excluded percentile even
for an excluded viewer where a cached value would do — micro-inefficiency, correct result.

---

## 7. Cross-task duplicate / collision debt

Largely clean: the historical `DuoRow`/`getDuoById` double-definition is resolved,
`computePercentiles` has a single home in `core`, and the worker job registry has **no** stale
stubs (the only `stubHandler` is `nemesis:conclude`, whose task WS5-T3 is legitimately unmerged).

### 7.1 Redundant ET-date helper copies whose delete-precondition is now met — `minor`
- **Files:** `apps/web/lib/nemesis/clock.ts:~19,26,31` and `apps/web/lib/ops-dashboard.ts:~16,34`
  reimplement ET-date helpers that now exist canonically in `@receipts/core` (`et-date.ts`).
  `clock.ts`'s own header says to delete the local copies once core exports them — that precondition
  is now satisfied.
- **Failure scenario:** Three copies agree today; a future tweak to the canonical helper won't
  propagate, risking silent ET-boundary divergence between the nemesis clock, the ops dashboard,
  and the rest of the app.
- **Fix:** Delete the local copies and import from `@receipts/core`.

---

## 8. Stale SPEC-GAPs (dependency has since merged)

Of ~119 `SPEC-GAP` occurrences (~76 files), ~105 are legitimate (permanent product deferrals,
DD-12 post-V1.5 items, P2 stretch, or unverified-live venue caveats). The following reference a
dependency that **is merged at `7b10793`**, so the gap is now closeable for real. (Two more —
the deletion nemesis-exit and the leaderboard bonus window — are recorded above as §3.1 and §6.2.)

### 8.1 Worker lock/reveal jobs skip the (now-existing) on-demand ISR revalidation — `minor`
- **Files:** `apps/worker/src/jobs/question-lock.ts:7,103` and
  `apps/worker/src/jobs/reveal-fire.ts:17,179` (SPEC-GAP: "POST /internal/revalidate … is WS8-T3
  scope (the endpoint doesn't exist yet) — skip the HTTP call").
- **Now merged:** WS8-T3 — `apps/web/app/api/v1/internal/revalidate/route.ts` exists and is fully
  hardened (allowlist, cap, rate limit).
- **Spec:** §2.3 (settlement/reveal flow "calls the web revalidation hook"); §6.7 ("revalidate
  pages"); §7.6 (`reveal:fire` revalidation).
- **Failure scenario:** On lock and on reveal the worker does **not** call the revalidation hook,
  so spectator/question pages only refresh via the 30s ISR timer instead of immediately. Bounded
  staleness (≤ `ISR_REVALIDATE_QUESTION_S`), but the designed synchronized-reveal page flip can
  lag up to ~30s — a soft dent in the P8 moment.
- **Fix:** Have both jobs POST to `/internal/revalidate` (bearer `INTERNAL_API_SECRET`) with the
  affected `/q/*` (and `/`) paths, per §2.3 step 3; close both SPEC-GAPs.

### 8.2 Profile page's stale "OG renderer 404s" comment — `nit`
- **File:** `apps/web/app/p/[slug]/page.tsx:73` (SPEC-GAP: "WS8 owns the real `/api/og/*`
  renderer … doesn't exist yet … today it 404s").
- **Now merged:** WS8-T1 — `/api/og/profile/[slug]/route.ts` (+4 more) exist; the URL resolves.
- **Impact:** The comment is misleading (the image works); no functional bug, but the stale claim
  could send a future reader chasing a non-existent 404.
- **Fix:** Delete the stale SPEC-GAP note.

### 8.3 Wallet unlink prior-recompute defers to a now-merged helper — `minor` (flag off)
- **File:** `apps/web/lib/wallet-flow.ts:172` (SPEC-GAP: "recomputing `placement_prior` … would
  need WS4-T8's helper, not merged").
- **Now merged:** WS4-T8 — `placement-service.ts` exports `seedPlacementPrior` /
  `computePlacementPriorAxes`.
- **Spec:** §12.5 ("`placement_prior` recomputed without wallet contribution (placement answers,
  if any, remain)").
- **Failure scenario:** On wallet unlink the prior isn't recomputed from remaining placement
  answers, so a stale wallet-derived prior can persist. Latent — `wallet_linking` flag is off.
- **Fix:** Call the placement prior helper on unlink to rebuild `placement_prior` sans wallet.

_Borderline (recorded for the reader, not counted):_ `reveal-fire.ts`/`nemesis-assign.ts` admin-
alert channel (WS10 shipped an ops dashboard but no paging audience); `merge.ts:189` per-profile
fingerprint recompute (WS4 shipped only the nightly full rebuild). The SPEC-GAP triage also noted
the **live** lock registry may have advanced past this commit (WS5-T2/WS6-T3/WS9-T4); those are
**not** treated as stale here because their code is not in `7b10793` — re-triage against whatever
commit is current when this log is picked up.

---

## 9. Grading, streaks & reveal pipeline (§6.5–6.7)

The pipeline is otherwise robust — grading is idempotent, the question state machine is monotonic
and lock-serialized, the gap/freeze rule and void handling match spec, replay reads domain rows
only, and no results leak pre-reveal (all verified, see §10). One real gap:

### 9.1 Reveal-time streak write is not monotonic-guarded → out-of-order reveal regresses a streak — `minor`
- **Files:** `apps/worker/src/jobs/reveal-fire.ts:111-137` (daily history is bounded to the
  current `questionDate` at :135, and `applyStreakForParticipant` is called with it);
  `packages/db/src/repositories/streaks.ts:96-141` (writes `current_streak`/`last_counted_date`
  **unconditionally** — no `max()`/monotonic guard against the profile's existing
  `last_counted_date`); the ordering assertion at `reveal-fire.ts:111-116` only checks **D−1** via
  `getPriorDayDailyQuestion` (`questions.ts:268-280`); `voidQuestionTx`
  (`settlement.ts:123-139`) has **no** prior-day gate at all.
- **Spec:** §6.6 ("daily days are always processed in `question_date` order … `reveal:fire` for
  daily D never fires before D−1's daily is `revealed` or `voided`"); §5.7 (transitions monotonic).
- **Failure scenario:** D−2's market lags unresolved; D−1 **voids** (void has no prior-day check,
  so it breaks the reveal-path induction the D−1-only assertion relies on); D resolves and reveals
  (its prior-day check sees D−1 = voided → passes) and participants advance `last_counted_date` to
  D. Later D−2 finally settles and reveals (its own prior-day check sees D−3 = revealed → passes),
  replays history **only through D−2**, and writes `last_counted_date ≤ D−2` — clobbering the
  profile's streak **backwards**. Non-participants self-heal on the next `streak:sweep` replay, but
  an active participant who *did* pick on D is not a sweep candidate, so they carry the regressed
  streak until their next participation reveal. Reachability is elevated because the §6.7
  admin-paging backstop (`REVEAL_MAX_DELAY_H`) meant to force resolution of stuck earlier days is
  itself an acknowledged unbuilt SPEC-GAP (`reveal-fire.ts:97-102`). No existing test exercises
  out-of-order reveal (the suites process days ascending).
- **Fix direction:** Make the reveal-time streak write monotonic — no-op (or replay through
  `max(questionDate, last_counted_date)`) when `questionDate <= profile.last_counted_date`;
  and/or gate `voidQuestionTx` (or strengthen the ordering assertion) on the **full** prior chain
  being settled, not just D−1.

---

## 10. Reviewed — not a bug

These areas were traced and deliberately **not** flagged:

- **Invariants INV-1..INV-10 all have real structural enforcement:** dependency denylist scan
  (`scripts/check-dependency-denylist.mjs`, wired in `lint` + CI) covers payment/exchange SDKs
  incl. `@polymarket/clob-client` and `kalshi-*-sdk`; identity schema has no phone/name/KYC/
  credential columns; pinned publicness + claim-nudge copy match §10.6 verbatim; wallet badge
  serialization (`toWalletBadge`) exposes no size buckets and the merged profile page routes
  through it (INV-7 holds end-to-end); first-pick age gate + `AGE_ATTESTATION_REQUIRED`;
  `middleware.ts` matcher is scoped to `/admin` so it cannot fragment the public CDN cache (INV-10),
  and `/q/[slug]` is viewer-free ISR with client-only viewer strip.
- **Config constants:** every Appendix D + §14.1 value in `core/config.ts` matches the doc;
  later-added constants are documented as such.
- **Grading idempotency** (`settlement-poll.ts`/`grade-followup.ts`, proven
  `settlement-poll.test.ts:146-166`), **question state-machine monotonicity** (`questions.ts:130-234`,
  `FOR UPDATE` on lock), **the gap/freeze rule** (`streak-replay.ts:183-215`, `streaks.ts:66-80`,
  proven `streak-replay.test.ts:113-206` + `grading-streaks-reveal.test.ts:209-264`), **void
  handling** (proven `grading-streaks-reveal.test.ts:296-340`), **replay reads domain rows only /
  `freeze_bank` untouched** (`streaks.ts:284-305`, `merge.ts:159-176`), **sweep runs only after a
  day is revealed/voided** (`streak-sweep.ts:42`), and **freeze earn 5-of-7, cap 2**
  (`streak-freeze-grant.ts:27-29`, proven `grading-streaks-reveal.test.ts:362-417`) — all verified
  by the pipeline pass (see §9.1 for the one exception).
- **Percentile bot-exclusion asymmetry** — correct and tested (§6).
- **Notification composition** — dedupe, quiet hours, marketing cap, transactional exemption,
  unsubscribe HMAC placement (§4, except the GET-mutation nit).
- **Engine math** — fingerprint/Glicko/matchers/scoring/chemistry/narration (§5, except telemetry nit).
- **SIWE nonce** — atomic Lua GET-then-DEL, single-use, replay-safe (`wallet-nonce-store.ts`).
- **OG `?v=` guard** — recomputes canonical hash, 302s mismatches, never renders; the 6th §10.5
  "template" (result) is correctly a revealed-state variant of the question template.
- **Fail-closed rate limiter, per-key isolation** — implemented and tested.

### Note (not counted as a finding)
`/q/[slug]` emits an `application/json+oembed` discovery `<link>` pointing at `/api/oembed`, which
doesn't exist yet (WS8-T4 unmerged) — unfurlers will 404 on discovery until that task lands.
Expected pre-WS8-T4; noted only so it isn't mistaken for a regression later.

# xTrace hackathon tasks — review log & process

Status: rounds 1–2 of the resumed run complete (22 + 8 fixes applied).
NOT yet converged — a fresh round must run clean to finish. Subagent quota
exhausted until 14:00 UTC 2026-07-23; a resume is scheduled. Protocol is now
v2 (single-round workflow + main-session fixing + commit per round — see
Process below).

This file is the durable state of the adversarial review process for
`docs/xtrace-hackathon-tasks.md`. It exists so the process can be resumed by
any future session (human or agent) after quota exhaustion or a dead
container: everything needed to continue lives on this branch
(`claude/xtrace-integration-brainstorm-t1chgj`), committed and pushed at every
checkpoint.

## Process (mandatory for every edit to the task doc)

Protocol v2 (single-round; supersedes the v1 multi-round loop after two
quota-truncated runs — v1's in-run fixer lost a completed round's findings
when it died, and v1's original convergence check once mistook 4 failed
reviewers for a clean round):

1. Edit `docs/xtrace-hackathon-tasks.md`.
2. Run ONE review round (4 reviewer agents on Sonnet, ~one quarter of the
   old per-round cost):

   ```
   Workflow({ scriptPath: "scripts/xtrace-task-review.workflow.js",
              args: { taskDocPath: "docs/xtrace-hackathon-tasks.md" } })
   ```

   Returns `{ cleanRound, findings, failedLenses }`. If reviewers fail
   (quota), their completed peers' findings are still in the return value /
   task output on disk — nothing is lost.
3. BEFORE applying anything: append the round's raw findings verbatim to
   this log under a "### Round N — PENDING" heading, commit, push. This
   makes the findings durable even if the fixing session dies mid-apply
   (the workflow task-output file also holds them, but that lives outside
   the repo).
4. The MAIN SESSION (not an agent) verifies each finding against the repo,
   applies the valid ones to the task doc, and rewrites the PENDING entry
   as the final round entry (applied/rejected with reasons).
5. Commit and push the task doc + this log IMMEDIATELY — before launching
   the next round:

   ```
   git add docs/xtrace-hackathon-tasks.md docs/xtrace-hackathon-review-log.md
   git commit -m "xtrace tasks: review round N (<x> applied)"
   git push -u origin claude/xtrace-integration-brainstorm-t1chgj
   ```
6. Repeat 2–5 until a round returns `cleanRound: true` (all 4 lenses ran
   AND zero findings — `failedLenses > 0` never counts as clean). Then set
   Status above to "CONVERGED" with the date, commit, push.

## How to resume after an interruption

- `git pull origin claude/xtrace-integration-brainstorm-t1chgj`, read the
  Status line above and the last entry under Round history.
- If Status says a round is mid-flight or the last workflow run didn't
  converge, just re-run the Workflow command from step 2 — rounds are
  stateless (each round re-reads the doc from disk), so nothing is lost by
  restarting the loop.
- If the task doc itself is mid-draft (Status: "draft in progress"), finish
  the draft first, then start the loop.

## Round history

### Round 2 (resumed run) — 8 applied, 0 rejected — split fixer

12 raw findings from 4 reviewers deduped to 8 unique. The in-run fixer
died on quota mid-application; the main session recovered the findings
from the workflow journal and finished the job (this event motivated
protocol v2 above). Applied by the fixer before it died: T6 step 0
`enforceGetBackstop` (the route would have shipped as the only backstop-less
`/api/v1` GET); T6 cache-lookup-before-rate-limit reorder with rationale;
`enforceRateLimit` returns-not-throws form pinned; T2 retry policy widened
to 429/5xx/network-timeouts (matching the venues template and T5's outage
arithmetic) with a timeout-retry AC. Applied by the main session from the
journal: T7 gate ladder rewritten (explicit steps 1–6: same
cache-before-limit order; target authorization via untruncated
`completedPairingIdsBetween` OR current candidates — the page-capped
history check would falsely 403 rivals older than 20 entries); T6 + T7 ACs
now pin that a cache hit does not consume the rate budget (demo-killer:
30 `/rivals` opens in a day would 429 and silently hide the panel);
T8 `calloutsSent` season window pinned to ET-calendar-day comparison (the
naive timestamptz-vs-DATE compare silently drops the season's final day);
T9 seed must set `status`/`scoreA`/`scoreB`/`edgeA`/`edgeB`/
`winnerProfileId` columns alongside the verdict jsonb (aggregates read
columns, not jsonb — jsonb-only seeding demos as 0-0-3 all-draws).

### Round 1 (resumed run) — 22 applied, 0 rejected

(Resumed run of 2026-07-23, after the quota-aborted round below; the loop's
round counter restarted. 26 raw findings from 4 reviewers deduped to 22
unique; every repo fact re-verified before editing; none rejected.)

- APPLIED [blocker] XH-T5/XH-T8: widened owner regex corrected to `/^(WS\d+|XH)-T\d+$/` — the previously pinned `/^(WS|XH)\d+-T\d+$/` still rejected the digit-less `XH-T5`/`XH-T8` owners (×3 dup findings merged)
- APPLIED [major] XH-T6: MEMORY search now ORs group ids of ALL pairings between the two profiles (current + completed, via T4's `completedPairingIdsBetween`) instead of only the current pairing's group — rematches are new pairing ids, so the old scoping silently missed every concluded week's memories; AC added asserting the captured `groupIds` (×2 dup findings merged)
- APPLIED [major] XH-T6: island-test AC rewritten to repo reality — no jsdom/@testing-library exists and web vitest pins `environment: 'node'`; fetch→envelope-unwrap→parse is extracted and unit-tested with stubbed `global.fetch`, presentational states via `renderToStaticMarkup`; adding jsdom declared out of scope
- APPLIED [major] XH-T6: `currentWeek` pinned — non-null only when `pairing.status === 'active'`, other statuses serve `currentWeek: null` (no 404); `daysRemaining` = ET days from `etDateString(now())` through `addDaysToDateString(weekStart, 6)`, clamped ≥ 0
- APPLIED [major] XH-T6: money-word AC de-contradicted — the test builds the real generator via `createGenerator` over a fake Anthropic-shaped client (the route does not re-filter, so doubling the Generator itself would bypass the filter the test exists to prove)
- APPLIED [major] XH-T4: `markIngested` contract rewritten to T5's mark-AFTER-successful-ingest protocol — the old claim-before-ingest comment would permanently lose facts on any ingest failure
- APPLIED [major] XH-T8: `stats` formulas pinned — season-scoped W-L-D bucketed by `winnerProfileId`; `bestStreak` = longest win run over completed pairings by `weekStart` (explicitly NOT `profiles.bestStreak`/`bestWinStreak`); `calloutsSent` by `createdAt` within `[startsOn, endsOn]`; `calloutsWon` via `pairingId` → completed pairing won by the profile
- APPLIED [major] XH-T9/XH-T8: demo recap flow unbroken — seed script now prints the season id, runbook invokes `run-season-recap.mjs <seasonId>`, and T8's given-id path explicitly skips the `endsOn < today` check
- APPLIED [minor] XH-T4: `etDay` pinned to `etDateString(now())` from `@receipts/core` (already exported from the root); dead conditional and `etCalendarDay` fallback removed
- APPLIED [minor] XH-T4: AC changed to `pnpm --filter @receipts/db db:check` — no root `db:check` alias exists
- APPLIED [minor] XH-T4: repository gains `lifetimeRecordBetween` + `completedPairingIdsBetween`, consumed by T6 and T7 — removes T7's dangling "same SQL aggregate as T6" reference (T7 doesn't depend on T6)
- APPLIED [minor] XH-T9: idempotency reworded — `seed-fixtures.mts` uses a sentinel early-exit, not upsert; both patterns allowed, early-exit named as the template's
- APPLIED [minor] XH-T2: venues template corrected — BOTH tsconfigs (`tsconfig.json` → base + noEmit, `tsconfig.build.json` → package), and no per-package eslint file (root `eslint.config.mjs` covers it)
- APPLIED [minor] XH-T2: `seasonConvId` annotated as reserved/unconsumed; "used by T5–T8" narrowed to the actual consumers (`pairingGroupId` T5/T6/T7, `pairingConvId` T5)
- APPLIED [minor] XH-T6/XH-T7: from-env instantiation + null-client behavior pinned — T6: null xtrace → MEMORY `[]`, null generator → `{banter:null}` 200; T7: null generator → `COMPANION_UNAVAILABLE`, null xtrace → MEMORY `[]` (×2 dup findings merged)
- APPLIED [minor] XH-T8: no-season-resolves path pinned — warn + zeroed report, `today` = `etDateString(now())`
- APPLIED [minor] XH-T7: draft button's callout-create POST pinned to `{}` body exactly like `CalloutButton` (optional `target_profile_id` stays unused; callout row identical to non-draft flow)
- APPLIED [minor] XH-T1: `contracts.test.ts` ERROR_CODES count pin (22 → 23) added to the errors.ts bullet, with the "editing the pin is expected" note
- APPLIED [minor] XH-T1/XH-T3: `COMPANION_DRAFT_MAX = 3` added to config; `draftCalloutResponseSchema` and T3's drafts output schema both use it (banter cap no longer doubles as the drafts cap)
- APPLIED [minor] XH-T1: dead contract surface dropped — `banterLineSchema` and `zCompanionArtifactId` removed (no task consumed either)
- APPLIED [minor] XH-T5/XH-T9: `apps/worker/scripts/run-companion-ingest.mjs` added to T5's Files list; runbook references it by path (the 04:00 cron alone can't drive a live demo)
- APPLIED [minor] XH-T9: seed verdict jsonb pinned to XH-T5's exact shape (per-profile `narration` map, both sides' lines populated) — wrong shapes degrade silently through T6/T8's optional chaining

### Round 2 — aborted, no coverage

All four reviewer lenses failed before reading the doc ("You've hit your
session limit · resets 9am (UTC)"). Zero findings were reported because zero
reviews ran; this round provides no evidence about doc quality. The workflow
script's convergence check has been fixed to abort (converged: false) when
lens agents fail with no findings, instead of declaring a clean round.

### Round 1 — 30 applied, 0 rejected

40 raw findings from 4 reviewers deduped to 30 unique findings; every repo
fact was re-verified before editing. No finding was wrong; the two claimed
duplicates that conflicted (T8 claimed-check: `profiles.kind = 'claimed'`
vs `user_id IS NOT NULL`) were resolved in favor of the repo's actual
precedent (`rivals/page.tsx` uses `profile.kind === 'claimed'`), and the
COMPANION_UNAVAILABLE placement conflict (T7 adds vs T1 adds) was resolved
to T1, the designated contract-change PR.

- APPLIED [blocker] XH-T6: route file moved to existing `[id]` segment (`pairings/[id]/banter/route.ts`); Next.js forbids a sibling `[pairingId]` slug — param read as `params.id` (×1)
- APPLIED [blocker] XH-T6: island spec now unwraps the §9.1 `{ data }` envelope before `getBanterResponseSchema.parse` (or reuses `request()` from `lib/pick-client.ts`); island-test AC pins the enveloped fetch-stub shape; same envelope note added to T7's button (`json.data.drafts`) (×4 dup findings merged)
- APPLIED [blocker] XH-T6: currentWeek scores must be derived from picks via `getFullPairingSharedQuestionPicks` + engine's `scoreNemesisWeek` — `scoreA/scoreB` are only written at conclusion by `updatePairingConclusion`, so the active row always reads 0–0
- APPLIED [major] XH-T5/XH-T8: added `apps/worker/test/registry.test.ts` edits to both Files lists — add jobs to `SPEC_JOBS` (T8 also `QUEUE_ONLY`) and widen owner regex to `/^(WS|XH)\d+-T\d+$/` (test currently rejects `XH-*` owners)
- APPLIED [major] XH-T1: added `RL_COMPANION_BANTER_PROFILE_D = 30` and `RL_CALLOUT_DRAFT_PROFILE_D = 10` to T1's config list; T6/T7 rate rules now pin `{ keyType: 'profile', limit: RL_*, windowSeconds: DAY }` and drop "suggested"
- APPLIED [major] XH-T5: documented the real verdict jsonb shape (`narration: { [profileId]: { line, emphasis } }`) with side-selection rules — T5 ingests each side's own line, T6 uses the viewer's line, T8 the profile's own lines (×2 dup findings merged)
- APPLIED [major] XH-T7: replaced the stream-of-consciousness MEMORY paragraph with a pinned procedure — all prior pairings, one user-scoped + one OR'd group-scoped search, group-first concat, de-dupe by id, truncate to `COMPANION_SEARCH_LIMIT`
- APPLIED [major] XH-T5: added outage circuit-breaker (5 consecutive failures or 5-minute wall-clock deadline, `aborted` in report) — the 200-source cap alone doesn't bound wall time under a down xTrace
- APPLIED [major] XH-T3: dependency changed to XH-T1 + XH-T2 (T3's files live in the package T2 scaffolds); T3 Files gains the barrel-extension bullet; critical-path prose updated
- APPLIED [major] XH-T8: dependency gains XH-T6 (`companionCopy.disclaimer` is created by T6); index table and critical-path prose updated
- APPLIED [minor] XH-T7: pinned `COMPANION_UNAVAILABLE: 503` — added to T1's `packages/core/src/errors.ts` list (T1 is the contract-change PR); T7 step 8 and AC rewritten, `PRICE_UNAVAILABLE` reuse forbidden (×4 dup findings merged)
- APPLIED [minor] XH-T3: TS-SDK error classes corrected in T3 + Appendix B — no `APIStatusError` in the TS SDK; `APIConnectionError` subclasses `APIError` and must be checked first; catch-all required (×2 dup findings merged)
- APPLIED [minor] XH-T6: `companionCopy` money-word coverage — copy.test.ts has no whole-file scan; task now adds its own per-block test case
- APPLIED [minor] XH-T2: scripts list corrected to `build`/`typecheck`/`test` — no per-package `lint` exists; root `pnpm lint` covers the package
- APPLIED [minor] XH-T8: claimed check pinned to `profiles.kind = 'claimed'` (rivals/page.tsx precedent); dead pointer to `lib/callouts-view.ts` removed (×2 dup findings merged, conflicting fixes resolved to repo precedent)
- APPLIED [minor] XH-T9: "three companion tables" → the two real tables (`companion_artifacts`, `companion_ingest_log`) (×3 dup findings merged)
- APPLIED [minor] XH-T9: "callout candidates state" seed item replaced — candidates are derived via `getCalloutCandidates`, nothing extra to seed; verify-both-directions note added
- APPLIED [minor] XH-T5: `at` parameter defined — defaults to `now()`, feeds ingest turn `date` and the wall-clock deadline, does not filter sources
- APPLIED [minor] XH-T6: `generated_at` pinned to the artifact row's `createdAt` `.toISOString()` on both cache hit and fresh insert (never `now()`); rule extended to T8's recap
- APPLIED [minor] XH-T4: `latestRecapForProfile` pinned to `kind = 'season_recap'` + greatest `createdAt` (kind filter load-bearing vs fresher banter artifacts)
- APPLIED [minor] XH-T8: worker script changed to `run-season-recap.mjs` mirroring `question-zero-drill/manual-schedule.mjs` (worker scripts are plain `.mjs`)
- APPLIED [minor] XH-T1: `export type SeasonRecapContent = z.infer<...>` added to T1's schema snippet; T3 signature comment now imports it from core (×2 dup findings merged)
- APPLIED [minor] doc: critical-path prose rewritten to match the dependency table (T2→T3 chain, T7 after T2/T3/T4, T8 also after T6, T9 after T5–T8)
- APPLIED [minor] XH-T2: `xtraceClientFromEnv` defaults `apiBase` to exported `XTRACE_DEFAULT_API_BASE = 'https://api.production.xtrace.ai'` when `XTRACE_API_BASE` unset
- APPLIED [minor] XH-T6: latency claim corrected to ~30s and XH-T3 client pinned to `maxRetries: 0` (SDK timeout is per attempt; retries doubled worst-case route latency)
- APPLIED [minor] XH-T8: note added that worst-case runs may exceed pg-boss job expiration and re-delivery is safe (step-1 skip + idempotent insert), not a bug
- APPLIED [minor] XH-T6: lifetime W-L-D switched from the page-capped `getNemesisHistoryPage` fold to a direct SQL aggregate over completed `nemesis_pairings` (fold truncates at `PAGINATION_MAX_LIMIT`); T7 references the same aggregate
- APPLIED [minor] XH-T5: "concluded or active" → `status` `'active'`/`'completed'` per `PAIRING_STATUS`, with explicit `scheduled`/`cancelled` exclusion
- APPLIED [minor] XH-T1: banter `max(3)` literals replaced with `COMPANION_BANTER_MAX_LINES` in T1's response schema and T3's `zodOutputFormat` schema
- APPLIED [minor] XH-T4: repository now exports `banterCacheKey`/`calloutDraftCacheKey`/`recapCacheKey` builders; T6/T7/T8 amended to call them instead of inline string formatting

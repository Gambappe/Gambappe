# xTrace hackathon tasks — review log & process

Status: round 1 complete (30 fixes applied). Round 2 DID NOT RUN — all four
reviewer agents failed on the session quota limit (resets 9am UTC); the
workflow's original convergence check mistook that for a clean round (script
since fixed to abort instead). NOT converged. Next step: re-run the Workflow
command from the Process section once agent quota is available.

This file is the durable state of the adversarial review process for
`docs/xtrace-hackathon-tasks.md`. It exists so the process can be resumed by
any future session (human or agent) after quota exhaustion or a dead
container: everything needed to continue lives on this branch
(`claude/xtrace-integration-brainstorm-t1chgj`), committed and pushed at every
checkpoint.

## Process (mandatory for every edit to the task doc)

1. Edit `docs/xtrace-hackathon-tasks.md`.
2. Run the adversarial review loop until it converges (a full round with zero
   accepted findings). In a Claude session:

   ```
   Workflow({ scriptPath: "scripts/xtrace-task-review.workflow.js",
              args: { taskDocPath: "docs/xtrace-hackathon-tasks.md",
                      logPath: "docs/xtrace-hackathon-review-log.md",
                      maxRounds: 4 } })
   ```

   The loop runs 4 reviewer lenses per round (repo-reality,
   junior-implementability, correctness/design, cross-task consistency) and
   one fixer agent that applies or rejects each finding and appends a round
   entry below. Cost: ~5 agents per round; historically 2–3 rounds to
   converge. If it returns `converged: false` (hit maxRounds), re-run it —
   the log below carries the state.
3. Commit and push the task doc + this log after the loop finishes (or after
   any partial progress worth keeping):

   ```
   git add docs/xtrace-hackathon-tasks.md docs/xtrace-hackathon-review-log.md
   git commit -m "xtrace tasks: review round(s) N..M"
   git push -u origin claude/xtrace-integration-brainstorm-t1chgj
   ```

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

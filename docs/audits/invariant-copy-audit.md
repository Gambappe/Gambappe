# Invariant & copy audit (WS14-T3)

Checklist run against design doc §1.2 (INV-1..10) and §10.6 (copy rules), per the WS14-T3
AC: "Checklist run: INV-1..10 each with evidence; copy scan for money words (`bet|stake|wager|\$`)
in `copy.ts` with allowlist." This is the audit gating §19.5's Gate P1 ("WS14-T3 audit signed").

**Scope note:** run against `main` at the commit noted in the sign-off below. WS5, WS6, WS7, and
WS8 each still have unmerged tasks at that point (duo matchup/history APIs, duo UI, share cards,
SEO pass — see `workstream-locks.json`). Those add code and copy this pass hasn't seen. This
audit is not a standing guarantee past its commit — re-run once the remaining WS1–WS13 tasks
land, and before Gate P1.5 (duo behind flag) if duo copy changes materially.

**Revision note:** an independent review after this doc's initial commit caught five accuracy
defects in the original text — a false blanket claim under INV-5 (matchmaking does read a
wallet-influenced fingerprint field for pairing selection; corrected below with the precise
reasoning for why the invariant still holds), a wrong file citation for `toWalletBadge`, a
copy-scan write-up that didn't match what its own stated grep command actually returns, and two
minor overstatements under INV-9 and INV-8. The corrections are folded into the sections below in
place, rather than kept as a separate errata list, since the whole point of this document is that
its claims are individually verifiable — an errata list would just be a second, competing set of
claims to check.

## INV-1 — never holds money, routes orders, sets odds, or takes positions

**Evidence:**
- `scripts/check-dependency-denylist.mjs` — denies `stripe`, `paypal`, `braintree`, `adyen`,
  `square`, `plaid`, `razorpay`, `coinbase`, `binance`, `ccxt`, exchange SDKs, and venue
  *trading* clients (`kalshi.*sdk|client|api`, `@polymarket/clob-client`) by name, scanning every
  workspace `package.json` plus the `pnpm-lock.yaml` transitive closure.
- Wired into CI: `.github/workflows/ci.yml` "Dependency denylist scan (INV-1 — no
  payment/exchange-trading SDKs)" step, `pnpm denylist`.
- Ran locally against the audited commit: **passed** ("no payment/exchange-trading SDKs found").
- `packages/venues` (Kalshi/Polymarket adapters) are read-only REST clients hand-rolled against
  each venue's public market-data API (§7.1–7.4) — no order-placement or account-linking calls
  exist in either adapter.

**Verdict: holds.**

## INV-2 — never collect/store credentials for any other platform

**Evidence:**
- `packages/db/src/schema/identity.ts` (`users`, `accounts`, `sessions`) — Auth.js tables for
  *our own* auth only (Google/X OAuth, email magic link). No columns anywhere for a venue API
  key, exchange login, or private key.
- `packages/db/src/repositories/wallet-links.ts` header comment: "No credential/key columns
  exist anywhere on this table (INV-2) — these helpers only ever move an address, its HMAC hash,
  a resolved proxy address, and the bucketed `enrichment` blob (INV-7)." Confirmed by reading the
  `wallet_links` schema and every repository function — no signing-key or session-credential
  field.
- `apps/web/lib/wallet-verify.ts` — wallet linking is a **message signature only**: `viem`'s
  `verifyMessage` against a SIWE message, EOA or smart-contract-wallet (EIP-1271/6492) signature.
  No private key, seed phrase, or transaction-signing request is ever solicited or stored; a
  verification failure of any kind (bad signature, unreachable RPC, malformed input) fails closed
  to `false`, never a stored credential.
- The only non-auth "API key" fields in the codebase (`apps/worker/src/lib/email-transport.ts`'s
  `RESEND_API_KEY`, `push-transport.ts`'s VAPID keys) are *our own* service credentials for our
  own email/push infrastructure, not a user's credential to another platform.

**Verdict: holds.**

## INV-3 — competition denominated only in points/ratings/streaks

**Evidence:**
- Schema-wide scan (`packages/db/src/schema/*.ts`) for `balance|currency|amount_usd|cash|credit`
  columns: **zero matches** across `identity.ts`, `markets.ts`, `engine.ts`, `modes.ts`,
  `social.ts`, `ops.ts`.
- `profiles` (identity.ts) carries only `bot_score`, `current_streak`/`best_streak`,
  `freeze_bank`, `current_win_streak`/`best_win_streak` — no balance-like field.
- `picks.yes_price_at_entry` (markets.ts) is an implied *probability* (`numeric(6,5)`, 0–1), not
  a money amount; `picks.edge` is `(win?1:0) − p_side_entry`, also unit-free.

**Verdict: holds.**

## INV-4 — identity is minimal (email/OAuth/passkey only)

**Evidence:**
- `packages/db/src/schema/identity.ts`'s `users` table comment: "Auth.js standard tables via the
  Drizzle adapter, minus columns INV-4 forbids: no name, no phone, no address, no image." Column
  list confirms: `id, email, email_verified, role, age_attested_at, created_at, updated_at` —
  nothing else.
- `profiles` carries only a generated `handle`/`slug` (public identity), never a real name.
- Email lives on `users` only, never on `profiles` — the table the public-facing queries and
  serializers actually read — so a public query has no path to leak it.

**Verdict: holds.**

## INV-5 — competitive records scored only from in-app picks

**Evidence:**
- `apps/worker/src/jobs/ratings-weekly.ts` imports nothing from the wallet or fingerprint
  modules — confirmed by import scan (`grep wallet|fingerprint`: no matches). Its actual
  repository imports are `applyDuoMatchRating`/`applyPairingRating`/`updateRating`/
  `updateDuoRating` and friends (glicko rating + inflation bookkeeping) — not `picks`/`questions`
  directly; those are read by the earlier grading/pairing jobs that produce the
  pairing/duo-match rows this job consumes.
- Wallet data's two direct consumers: `packages/engine/src/wallet-bucketing.ts`/
  `apps/worker/src/jobs/wallet-ingest.ts` write a wallet-derived prior into
  `fingerprints.placement_prior` (§8.7/§12.4), and `apps/web/lib/serialize-wallet.ts`'s
  `toWalletBadge` (called from `apps/web/lib/profile-page.ts`, **not**
  `packages/db/src/repositories/profile-page.ts` — that file only comments on where the wallet
  badge logic lives) renders the wallet-linked **badge** only.
- **A real transitive path exists and is worth stating precisely, not glossing over:**
  `packages/engine/src/fingerprint.ts` blends `placement_prior.chalk` into the stored `chalk`
  axis (`blendWithPrior`, weight `PRIOR_WEIGHT=5`, decaying but never zero — same function used
  for the placement-only prior, wallet import is just one more source feeding the same field).
  `apps/worker/src/jobs/duo-matchmaker.ts` then reads `fingerprints.chalk` and
  `fingerprints.categoryShares` directly (lines 64–65) to score pairing `complementarity`. So a
  wallet import *can* influence which profiles get paired as duo partners — it is not confined to
  "seed the fingerprint and a badge" in the narrowest reading of that phrase.
- Why this still satisfies INV-5 rather than violating it: the design doc's own gloss on prior
  blending (line 843) is the operative boundary — "Priors never touch accuracy/edge/brier (INV-5
  — skill comes only from in-app picks)." INV-5's "never affects ratings, streaks, matches, or
  leaderboards" is about match *records and scoring* (accuracy/edge/brier/rating deltas), which
  `ratings-weekly.ts` computes from `picks`/pairing outcomes alone and never touches a prior.
  Duo-matchmaker's use of prior-blended `chalk` for *partner selection* is a different, explicitly
  spec'd mechanism (§8.2/§8.5 complementarity; §8.7 prior blending) — it changes who you're
  matched with, not how any match, streak, or rating is scored once it happens. `categoryShares`
  used in that same complementarity formula is prior-free (computed purely from in-app picks) in
  the no-wallet case, so a ghost/no-wallet profile's pairing is entirely in-app-derived; a
  wallet-linked profile's pairing is derived from in-app picks blended with its own imported
  history, at a weight that shrinks toward zero as its own pick count (`n`) grows — never a
  strictly imported number.

**Verdict: holds** — on the precise basis above (prior blending affects duo *pairing selection*,
never accuracy/edge/brier/rating computation), not the blanket "matchmaking and rating
computation read only from picks/questions/ratings" claimed in an earlier draft of this doc.

## INV-6 — public means public; pseudonymity is permanent

**Evidence:**
- `apps/web/lib/copy.ts`'s `CLAIM_PUBLICNESS_STATEMENT` ("Your picks, results, and rating are
  public — that's the point. You can stay pseudonymous forever.") is pinned verbatim per §10.6
  and rendered in `apps/web/components/claim/ClaimEntry.tsx:157`.
- No real-name field exists on `profiles` (see INV-4) — the only identity surfaced anywhere
  (handle, slug, streaks, picks, ratings) is pseudonymous by construction, not by a UI choice
  layered on top of a real-name schema.

**Verdict: holds.**

## INV-7 — exact real-money amounts never stored or displayed

**Evidence:**
- `packages/engine/src/wallet-bucketing.ts` is the **only** place a raw position notional is
  ever read (header comment: "This is the ONLY place raw position notionals are ever looked
  at"). `sizeBucket()` reads `notionalUsd` once to pick a `WALLET_SIZE_BUCKETS` bucket; the
  returned `WalletEnrichment` object contains only bucket/category *counts* and derived priors —
  the notional itself is never copied into it.
- `packages/engine/test/wallet-bucketing.test.ts` asserts the persisted JSON contains no numeric
  field except counts/priors (the §12.4-mandated unit test).
- `packages/db/src/repositories/wallet-links.ts`'s `unlinkWalletLink` nulls the plaintext
  `address`/`proxy_address` on unlink — even the linked address itself doesn't survive unlink,
  only its HMAC hash (relink-cooldown check).

**Verdict: holds.**

## INV-8 — competitive pressure targets participation/ego, never stake size

**Evidence:** see the copy scan below (clean) plus:
- `markets.liquidity_usd` (markets.ts) is commented "Curation filters only — never displayed
  (INV-8)"; confirmed by grep. It's used as a `min_liquidity_usd` query-param filter in
  `app/api/admin/markets/route.ts` (an admin curation tool) — and that route's response body
  does return whole `listMarkets` rows, so `liquidityUsd` is present in the admin JSON response,
  not just the filter param. That route is auth-gated to admins (non-admin/no-token 404s, per
  WS10-T1), and no *public-facing* serializer (`serialize-question.ts`, `question-view.ts`,
  profile/duo/nemesis serializers) exposes it — the admin curation tool is the one place it's
  meant to be visible, matching §15.2's "liquidity ≥ floor" curation-filter spec, not a display
  to end users.

**Verdict: holds.**

## INV-9 — 18+ self-attestation, timestamped before first participation

**Evidence:**
- `users.age_attested_at` / `profiles.age_attested_at` — both nullable timestamp columns,
  required non-null before a pick/claim completes.
- `apps/web/app/api/v1/questions/[id]/picks/route.ts`: if `profile.ageAttestedAt === null`, the
  request requires `body.age_attested === true` in the same call and stamps `ageAttestedAt` at
  that moment — the first-pick attest is atomic with the pick itself (§6.2 step 0).
- `apps/web/app/api/v1/claim/route.ts` takes `body.age_attested` on claim — re-affirmed at claim
  per the invariant's text, not just inherited from the ghost profile.
- `apps/web/app/layout.tsx` renders `EIGHTEEN_PLUS_FOOTER_NOTICE` in a `<footer>` inside the root
  layout — every page gets it, there's no per-route opt-out.
- **Gap found (flagging, not a violation):** §7.8's outbound deep-link builder ("Trade this on
  {Kalshi|Polymarket}" link, attested-only referral params `KALSHI_REF_PARAM`/
  `POLYMARKET_REF_PARAM`) has no actual implementation anywhere in the codebase —
  `markets.venue_url` is serialized straight through (`serialize-question.ts:97`,
  `question-view.ts:116`) with no ref-param attachment logic at all, and no UI surface renders an
  outbound venue link. The one piece that *does* exist: `venue_outbound_click` is declared in the
  canonical analytics event-name union (`packages/core/src/types/analytics.ts:26`) but nothing in
  the codebase ever emits it — a reserved name with no caller, not a built feature. This isn't an
  INV-9 *violation* (no ref param is ever attached to anyone, attested or not, so nothing leaks to
  an unattested session — the invariant holds vacuously) but the feature §7.8 describes, and which
  INV-9's own enforcement column cites as "link-out builder (§7.8)," is simply unbuilt. No WBS row
  in §19.3 explicitly owns it either. Recommend a follow-up task be added to the WBS before Gate
  P1 ships, since §7.8 also states this link is "the only money-adjacent surface" the product is
  supposed to have at all — right now it has none, which is safe but incomplete relative to spec.

**Verdict: holds (with one unbuilt-feature gap noted above, not a violation).**

## INV-10 — spectator pages are viewer-free

**Evidence:**
- `apps/web/test/question-state-view.test.tsx`'s `INV-10 — SSR is viewer-free` describe block:
  renders `QuestionStateView`/`ViewerStrip` to static HTML twice (anon vs. a populated viewer
  state) and asserts byte-identical output.
- `apps/web/e2e/question-page.spec.ts`'s `INV-10 — spectator page is viewer-free at the HTTP
  layer` describe block: real HTTP requests with/without a ghost cookie, asserting identical
  response bytes.
- `apps/web/e2e/spectator-cache-key.spec.ts`: `GET /q/:slug` is byte-identical with and without a
  ghost cookie present (§10.2) — the cache-key-safety proof for the CDN layer.
- All three were green on the audited commit (see sign-off).

**Verdict: holds.**

## Copy scan (§10.6, money words: `bet|stake|wager|\$`)

Scanned `apps/web/lib/copy.ts` (the single source of every user-facing string, per §10.6) with
the AC's literal pattern: `grep -niE '\b(bet|stake|wager)\b|\$'`.

**Run for real, the pattern returns 14 lines — reported here honestly rather than the tidier
two-category story an earlier draft of this doc gave:**
- 1 line is the file's own rule-documenting comment ("No money amounts, 'bets', stake sizes...").
- The other 13 are **not** money words at all — they're TypeScript template-literal
  interpolations (`` `${streak}-day streak` ``, `` `Top ${topPercent}%` ``, etc.). The regex's
  bare `\$` alternative matches the `$` in `${` , which is JS syntax, not a currency sign. None of
  these strings contain an actual dollar amount (verified by reading each one).
- **Neither of the two "not wagers" reassurance strings (`CLAIM_AGE_ATTEST_FOOTNOTE`,
  `EIGHTEEN_PLUS_FOOTER_NOTICE`) is actually matched by this regex** — "wagers" is plural, and
  `\bwager\b` requires a word boundary immediately after "wager," which the trailing "s" removes.
  An earlier draft of this doc claimed these two strings were caught by the scan and allowlisted
  as negations; they were never caught in the first place, so there was nothing for the AC's
  literal pattern to allowlist there.
- Separately (not from this grep, but by direct inspection, since the AC pattern has this gap):
  those two reassurance strings *do* use "wagers"/"money" — always in negation ("Receipts never
  holds money — picks are for competition, not wagers"), the opposite of the pressure INV-8
  guards against. Manually checking inflected forms the literal AC pattern misses
  (`bets|betting|stakes|staking|wagers|wagering|gamble|gambling|payout`) across the whole file
  turns up nothing beyond those two negations and the rule comment.
- No bare dollar amount (`$` followed by a digit) appears anywhere in the file.

**Broader sweep (bonus, beyond the AC's copy.ts-only scope):** the same literal pattern plus the
inflected-forms check above were also run across `apps/web/app/**`, `apps/web/components/**`, and
`apps/web/lib/**` (all `.ts`/`.tsx`, excluding tests) to catch any literal string that bypassed
`copy.ts` entirely. Zero matches beyond template-literal `$` syntax and the two negation strings
already covered above. The two pinned §10.6 strings (publicness statement, claim-nudge copy) were
also spot-checked verbatim against `ClaimEntry.tsx:157` and match exactly.

**Verdict: clean** — confirmed by manual inspection of every line the regex actually returns plus
a supplementary inflected-forms check, not by the AC's literal pattern alone (which, run exactly
as specified, neither flags a real violation nor catches the two strings worth allowlisting).

## Sign-off

| | |
|---|---|
| Audited commit | `d7ccd6f706cc31ad50b282f583d218f28caff9e4` (`main`) |
| Date | 2026-07-18 |
| Method | Static code/schema review (grep + file reads) + existing automated test suites (`pnpm denylist`, `question-state-view.test.tsx`, `question-page.spec.ts`, `spectator-cache-key.spec.ts`) — no new tests were needed since every invariant already has either a dedicated CI check or an existing test asserting it |
| Result | INV-1 through INV-10: **hold**. One unbuilt-feature gap noted under INV-9 (§7.8 outbound deep-link builder) — not a violation, flagged for WBS follow-up. Copy scan: **clean**. |
| Signed | claude-code-web-session-35b05898 (WS14-T3) |
| Revised | 2026-07-19, same session, following an independent Fable-model review of the merged PR — see the Revision note near the top. All five findings were independently re-verified against the repository before the corrections above were made. |

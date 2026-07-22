# Auth/login fix plan (WS25)

## 0. Why this exists

Real sign-in is currently non-functional for every provider in any environment where
`AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`/`RESEND_API_KEY`/`EMAIL_FROM` aren't set (which
includes this sandbox, and — as far as this plan's investigation could tell — production,
since no task in the original §19 WBS or the journeys-plan WBS ever wires real Resend
delivery into the sign-in flow specifically). Investigated live against a running
`next dev` instance plus a direct read of `auth.ts`, `lib/auth-providers.ts`, and
`apps/worker/src/lib/email-transport.ts`.

Two independent bugs, both reachable from `/claim`'s sign-in step
(`components/claim/ClaimEntry.tsx`):

**Bug A — Google button is shown even when unconfigured.** `getEnabledAuthProviders()`
(`apps/web/lib/auth-providers.ts`) hardcodes `'google'` into the enabled-providers array
unconditionally, and `auth.ts`'s `buildProviders()` unconditionally pushes
`Google({...})` too. Contrast the `'x'`/Twitter provider, which both functions correctly
gate on `AUTH_TWITTER_ID && AUTH_TWITTER_SECRET` being present — `getEnabledAuthProviders`'s
own doc comment says it "mirrors the same env-presence gate `auth.ts` uses for the
Twitter/X provider," but the code doesn't actually do that for Google. Confirmed via a
direct `POST /api/auth/signin/google` request against the running dev server: the
redirect `Location` header is
`https://accounts.google.com/o/oauth2/v2/auth?...&client_id=undefined&...` — proof the
button is live and broken, not just theoretically unconfigured.

**Bug B — Email magic-link sign-in throws unconditionally in production.**
`auth.ts`'s `sendVerificationRequest`:

```ts
if (process.env.NODE_ENV !== 'production') {
  recordMagicLink(identifier, url);
  return;
}
throw new Error(
  'sendVerificationRequest: production email sending is not wired yet (WS9 scope)',
);
```

The `NODE_ENV !== 'production'` branch is why this looked fine when tested locally
against `next dev` (`NODE_ENV=development`) — every local/dev attempt takes the stub path
and succeeds. In production the function always throws, and Auth.js has no special
handling for an arbitrary thrown `Error` here, so it surfaces as its generic
`/api/auth/error?error=Configuration` page ("Server error — There is a problem with the
server configuration. Check the server logs for more information.") for every real user,
every time.

The comment's "WS9 scope" pointer is stale. `WS9-T1` ("Outbox + email channel," confirmed
`done` in the workstream-lock registry, phase `P1`) built
`apps/worker/src/lib/email-transport.ts` — a real `ResendEmailTransport` /
`LoggingEmailTransport` / `defaultEmailTransport()` — but that file's own header says
outright: *"the auth email flow itself isn't touched here — out of scope, see PR notes."*
The design doc's own §19 WBS row for WS9-T1 (`receipts-design-doc.md:1459`) confirms its
scope was "notifications table flow, `notify:dispatch`, Resend templates, prefs +
List-Unsubscribe" — the product notification system, not sign-in. No task anywhere in
§19 or the journeys-plan (`docs/journeys-plan.md`, WS16–WS24) ever wires Resend into
`auth.ts`. This plan is that missing task.

`.env.example` (repo root) already documents `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`/
`RESEND_API_KEY`/`EMAIL_FROM` as expected secrets — provisioning real values in a given
deployment is out of this plan's scope (nobody here holds those credentials); this plan
only fixes the code so that (a) an unconfigured Google button never renders instead of
breaking, and (b) email sign-in actually sends through Resend once `RESEND_API_KEY` is
provisioned, with a graceful failure path if it isn't or if the send itself fails.

## Revision history

**Revision 1.** This plan originally proposed task IDs `WS24-T1..T5` and extracting the
email transport to `packages/core/src/server`. An independent review caught two
problems: `WS16`–`WS24` is already fully allocated to `docs/journeys-plan.md` (`WS24-T1`
specifically already exists, `done`, as the Departures-board pilot — the ID collision
would have silently dropped this plan's real WS24-T1 during `add-tasks` and left WS24-T5
pointing at the wrong, unrelated task), so this plan moved to the next-free range,
`WS25-T1..T5`, under its own phase namespace (`A0`, matching how `journeys-plan.md` uses
`J0..JQ` and `swipe-ux-plan.md` uses `SP1..SPQ` rather than reusing the closed, historical
`P0` "48-hour build" wave). And the `packages/core` extraction wasn't the "pure move,
zero behavior change" it was described as — `email-transport.ts` imports `apps/worker`'s
own pino logger (a new dependency `packages/core` doesn't have), the `@receipts/core/server`
subpath is a single flat barrel file (`packages/core/src/server.ts`) not a directory,
`apps/worker`'s test imports the file by its current path directly, and any `packages/core`
change needs a `contract-change`-labeled PR with a design-doc §4.2 amendment in the same
PR (`receipts-design-doc.md:26`). Revision 1 responded by dropping the extraction in
favor of duplicating the transport into `apps/web/lib/`.

**Revision 2 (current).** Duplication was explicitly requested to be revisited in favor
of the shared-package approach. Doing that properly — not just reverting to Revision 0's
naive version — resolves every concern Revision 1 raised, rather than reintroducing them:

- **The pino-dependency problem is avoidable, not fundamental.** Only one of the three
  transport classes ever logs — `LoggingEmailTransport` (its stub "email sent" line);
  `ResendEmailTransport` never calls a logger at all, and `defaultEmailTransport()`
  itself doesn't either. So `LoggingEmailTransport` takes a minimal, structurally-typed
  logger (`{ info(obj: Record<string, unknown>, msg: string): void }`) via an **optional**
  constructor parameter, defaulting to a no-op implementation, instead of importing a
  concrete pino instance. `packages/core` gains no new runtime dependency; each real app
  passes in its own already-existing logger (`apps/worker/src/logger.ts`'s `logger`,
  `apps/web/lib/logger.ts`'s `logger`) at the call site, while call sites that don't care
  about logging (see the `notify-dispatch.test.ts` note below) keep working with zero
  changes. This is also just better design for genuinely shared code independent of this
  plan's constraints — a library shouldn't hardcode which app's logger instance it writes
  to, or force every caller to supply one it doesn't need.
- **The flat-file-vs-directory problem disappears by following the existing pattern
  instead of fighting it.** `packages/core/src/server.ts` already re-exports flat
  sibling files (`export * from './notifications-token.js'; export * from
  './share-token.js';`). Adding `packages/core/src/email-transport.ts` alongside them
  and adding one more `export * from './email-transport.js';` line to `server.ts` fits
  that convention exactly — no directory restructure, no change to the `package.json`
  `exports` map.
- **The `contract-change` process doesn't go away — it's a real repo rule — so this plan
  now requires it explicitly** (label + same-PR `receipts-design-doc.md` §4.2 amendment)
  instead of routing around it. That amendment needs to do more than announce the new
  export — see "Why `packages/core` and not `packages/venues`" below, a scope-fit
  question a reviewer of that PR will very likely raise if the plan doesn't settle it
  first.
- **The test-import problem is solved by migrating, not shimming — and there are two
  call sites in `apps/worker`, not one.** `apps/worker/src/lib/email-transport.ts` is
  deleted outright (no forwarding re-export left behind).
  `apps/worker/src/jobs/notify-dispatch.ts` (the real production call site — confirmed
  via grep, `defaultEmailTransport()` at line 361) updates its import to
  `@receipts/core/server` and now passes its own `logger` explicitly.
  `apps/worker/test/email-transport.test.ts` moves to `packages/core`'s own test suite
  with an updated import path, asserting the exact same behavior it did before. And
  `apps/worker/test/integration/notify-dispatch.test.ts` — found on a second, wider grep
  after an earlier draft of this plan missed it — imports `LoggingEmailTransport`
  directly and constructs it with zero arguments 11 times (it deliberately bypasses
  `defaultEmailTransport()` to inject a transport it can inspect — see that file's own
  comment at line 49). Because the logger parameter is optional (previous bullet), those
  11 call sites keep compiling unchanged; only the file's import path needs to move to
  `@receipts/core/server`.

`apps/web` no longer gets its own local copy at all (Revision 1's `apps/web/lib/
email-transport.ts` and its cross-reference-comment requirement are gone) — WS25-T3
becomes a second, ordinary consumer of the same shared module `apps/worker` already
uses, the way `signUnsubscribeToken` (also `@receipts/core/server`) already works —
`notify-dispatch.ts` already imports it from that exact subpath today, so this isn't a
new pattern for that file, just one more export from it.

**Why `packages/core` and not `packages/venues`.** `packages/venues` is the repo's
established precedent for exactly this shape — a real/mock split behind a shared
interface (`VenueAdapter` / `MockVenueAdapter` / real `KalshiAdapter`/`PolymarketAdapter`),
structurally identical to `EmailTransport` / `LoggingEmailTransport` /
`ResendEmailTransport`. It's a fair question whether the transport belongs there instead
of in `packages/core`, which §4.2 otherwise describes as holding "constants, error
codes, enums, branded ids, zod API schemas, domain types, flags" — token-format
contracts, not live HTTP adapters. But `packages/venues` is domain-scoped to this app's
prediction-market data sources (its own `package.json`: *"VenueAdapter contract... +
real Kalshi/Polymarket adapters"*) — a "venue" is a specific first-class concept in this
product (where a question's market data comes from), and an email provider isn't one,
structural parallel notwithstanding. `packages/core/src/server` is already the
established (if so far pure-function-only) home for "Node-only code both `apps/worker`
and server-only `apps/web` code need, that must never reach a browser bundle" — a
description that covers an HTTP-calling email transport (needs `fetch` + server env
vars, must never ship to a browser for the same reason a signing secret must not) just
as much as it covers HMAC signing. Given the transport is small (~90 lines) and has
exactly two consumers, a brand-new dedicated package for it would be disproportionate
overhead this bug-fix plan doesn't need to take on. The design-doc §4.2 amendment this
plan's `contract-change` PR must include should say this explicitly, so it isn't
relitigated for the first time inside that PR's review.

## 1. Design

- **WS25-T1** gates Google's exposure exactly like X already is — smallest possible fix,
  ships independently, makes the broken button disappear immediately in any
  under-configured environment (including this one) without waiting on the rest of this
  plan.
- **WS25-T2** extracts the existing, already-tested `EmailTransport` /
  `ResendEmailTransport` / `LoggingEmailTransport` / `defaultEmailTransport()` from
  `apps/worker/src/lib/email-transport.ts` into `packages/core/src/email-transport.ts`,
  re-exported via the existing `@receipts/core/server` subpath, with the logger
  dependency-injected (see "Revision 2" above) so `packages/core` takes on no new
  runtime dependency. `apps/worker`'s copy is deleted, its one real call site
  (`notify-dispatch.ts`) migrates to the shared import, and its test moves with the
  code. This is a genuine single-source-of-truth move, not a duplication — and, per
  §0.2's rule, ships as a `contract-change`-labeled PR with the matching design-doc
  §4.2 amendment in the same PR.
- **WS25-T3** is the actual fix for Bug B: `auth.ts`'s `sendVerificationRequest` calls
  the shared transport (from `@receipts/core/server`, passing `apps/web/lib/logger.ts`'s
  `logger`) instead of throwing. `apps/web/lib/magic-link-mailbox.ts`'s
  `recordMagicLink`/`getLastMagicLink`/`clearMagicLinkMailbox` are retired (grepped: only
  `auth.ts` calls `recordMagicLink`, nothing calls `getLastMagicLink`/
  `clearMagicLinkMailbox` today — this is dead-code removal, not an API change anything
  depends on) in favor of the transport's own `LoggingEmailTransport`, which already
  covers the same "no real provider configured → keep an in-memory record" need.
- **WS25-T4** closes the failure-mode gap: confirm (empirically, via a real integration
  test — the existing code comment's claim that a thrown error "surfaces as Auth.js's
  normal EmailSignin error redirect" has not actually been verified by any test) how
  Auth.js needs an error shaped in order to redirect gracefully instead of hitting the
  generic Configuration page, and make a Resend send failure (bad API key, Resend down,
  network error) use that shape.
- **WS25-T5** is regression coverage tying the above together end-to-end, and confirms
  `apps/web/e2e/auth-provider-config.spec.ts` (an existing, on-topic test that already
  exercises real `auth()` under production `next start` for a different bug) stays green
  through T3/T4's edits to `buildProviders()`/`sendVerificationRequest`.

Sequencing: T1 has no dependencies and should ship first/independently. T2 → T3 → T4 are
a strict chain (each needs the previous). T5 depends on T1, T3, and T4 (needs the real
behavior of all three to test against).

## 2. Tasks

| ID | Title | Phase | Depends | AC |
|---|---|---|---|---|
| WS25-T1 | Gate the Google sign-in provider on env-presence, matching the existing X/Twitter pattern | A0 | — | `getEnabledAuthProviders()` excludes `'google'` unless both `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are set; `auth.ts`'s `buildProviders()` applies the identical gate so the server-side provider list matches what the claim UI advertises (no button the server can't complete); unit tests cover all four configured/unconfigured combinations of google×x; `'email'` stays unconditionally enabled (unaffected). |
| WS25-T2 | Extract the Resend email transport to `packages/core/src/email-transport.ts` (contract-change), with the logger dependency-injected | A0 | — | New `packages/core/src/email-transport.ts` carries `EmailTransport`/`ResendEmailTransport`/`LoggingEmailTransport`/`defaultEmailTransport`, ported from `apps/worker/src/lib/email-transport.ts`; only `LoggingEmailTransport` logs, and it now takes a minimal structurally-typed logger (`{ info(obj, msg): void }`) via an **optional** constructor parameter (default: no-op) rather than importing a concrete pino instance — `defaultEmailTransport(logger?)` threads it through, `packages/core`'s `package.json` gains no new dependency; exported via `packages/core/src/server.ts` (`export * from './email-transport.js';`), matching that file's existing flat-barrel pattern — no directory restructure, no `package.json` `exports` change; `apps/worker/src/lib/email-transport.ts` is deleted (not shimmed); **three** call sites migrate: `apps/worker/src/jobs/notify-dispatch.ts` (real production use) imports from `@receipts/core/server` and passes its own `logger` (`../logger.js`) explicitly; `apps/worker/test/email-transport.test.ts` moves to `packages/core`'s test suite with its import path updated, covering the exact same behavior as before; `apps/worker/test/integration/notify-dispatch.test.ts` (11 zero-arg `new LoggingEmailTransport()` call sites that deliberately bypass `defaultEmailTransport()` to inject an inspectable transport, per that file's own comment) gets only its import path updated to `@receipts/core/server` — the optional-logger design means its 11 call sites don't need to change; PR carries the `contract-change` label and amends `receipts-design-doc.md` §4.2 in the same PR, both documenting the new `@receipts/core/server` export and stating why it belongs in `packages/core` rather than `packages/venues` (see the plan's "Why `packages/core` and not `packages/venues`" section). |
| WS25-T3 | Wire real Resend delivery into `auth.ts`'s `sendVerificationRequest`; remove the unconditional production throw | A0 | WS25-T2 | `sendVerificationRequest` calls `defaultEmailTransport(logger).send(...)` (imported from `@receipts/core/server`, `logger` from `apps/web/lib/logger.ts`) with a real magic-link template (subject/html/text, following `lib/copy.ts`'s existing brand-voice conventions and `apps/worker/src/lib/notification-email-template.ts`'s existing template style) in every environment — no more `NODE_ENV` branch, since the transport itself already degrades to a logging stub when `RESEND_API_KEY` is unset; `apps/web/lib/magic-link-mailbox.ts` and its `recordMagicLink` call site are removed (confirmed dead once this lands — nothing else calls `getLastMagicLink`/`clearMagicLinkMailbox` today); **both** stale "WS9 scope" comments in `auth.ts` are corrected to describe what's actually wired — the top-of-file module docblock ("Real magic-link delivery (Resend) is WS9 scope...") *and* the inline comment directly above the old throw ("WS2-T2 stub: real Resend sending is WS9 scope...") — not just whichever one sits next to the code being edited; `enforceAuthEmailSendLimit` still runs before any send attempt, unchanged. |
| WS25-T4 | Make a Resend send failure degrade gracefully instead of hitting Auth.js's generic Configuration error page | A0 | WS25-T3 | Empirically confirm (new test, not just re-trusting the existing rate-limit comment) what error shape/class Auth.js needs thrown from inside `sendVerificationRequest` to redirect to its normal `EmailSignin`-error state rather than the generic `Configuration` page; a `ResendEmailTransport` send failure (mocked non-2xx/network error) and a missing-`EMAIL_FROM`-while-`RESEND_API_KEY`-set misconfiguration both use that shape; a user hitting either case lands on a page that says sign-in failed and invites a retry, never the raw "Server error / check the server logs" page. |
| WS25-T5 | Regression coverage for the full sign-in path (provider gating + transport selection + send success/failure) | A0 | WS25-T1, WS25-T3, WS25-T4 | Unit tests: all four provider-gating combinations (already listed under T1, consolidated here if not already merged); transport selection (stub vs. real) by env; a mocked successful Resend send. Integration/e2e: a production-mode (`next start`, `NODE_ENV=production`) run of the email sign-in step against a mocked Resend endpoint reaches `/api/auth/verify-request` on success and the graceful failure state (from T4) on a forced send failure — this is the first test in the repo to actually exercise the production email branch at all (today only the dev-mode stub path is tested, per `golden-loop.spec.ts`'s own header comment on why it bypasses real sign-in). `apps/web/e2e/auth-provider-config.spec.ts` (existing, unrelated bug it guards against) is confirmed still green. `apps/worker`'s own notification-dispatch tests (the real consumer migrated in WS25-T2) are confirmed still green post-migration — this is the regression safety net for the worker side, since WS25-T2 touches its real production import, not just a copy. |

## 3. Explicitly out of scope

- Provisioning real `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`/`RESEND_API_KEY`/`EMAIL_FROM`
  values in any environment (sandbox, staging, or production) — that's deployment
  configuration, not a code change, and nobody working this plan holds those credentials.
- Wiring up X/Twitter for real (it's already correctly gated off when unconfigured, so it
  has no user-facing bug — only Google and email do).
- Generalizing the email transport for future use cases beyond the two it now serves
  (product notifications via `apps/worker`, auth magic-links via `apps/web`) — e.g. a
  templating abstraction, provider fallback/retry, or multi-provider support. WS25-T2
  moves the existing implementation as-is; broadening its interface is a separate task
  if a third real use case ever needs it.
- Any further `packages/core` reorganization beyond adding the one new
  `email-transport.ts` file and its `server.ts` re-export line — no changes to
  `notifications-token.ts`/`share-token.ts` or the rest of the package.

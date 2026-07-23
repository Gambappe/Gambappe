# xTrace/Claude companion demo runbook (XH-T9)

One command builds a demo-ready rivalry world; this doc walks the three companion surfaces
(banter, callout drafts, season wrapped) top to bottom on a fresh dev stack, with real xTrace
and Claude keys. See `docs/xtrace-hackathon-tasks.md` for the full technical spec this demo
proves out (XH-T1–T9).

**The pitch, in one line:** facts are authoritative, memory is color. Every number the judges
see (record, streaks, callout wins) comes straight from the deterministic engine — xTrace/Claude
only ever add flavor text on top, and the money-word filter + fail-open design mean the demo
degrades to silence, never to a wrong number, if either service hiccups mid-demo.

## 1. Prerequisites

- Local Postgres + Redis running, migrations applied: `pnpm db:migrate` (do NOT run
  `pnpm db:seed` for this demo — the companion demo world is self-contained and unrelated to
  the general dev seed).
- A dev web server (`pnpm --filter web dev`) and a running worker (`pnpm --filter worker dev`) —
  the manual trigger scripts below only ENQUEUE jobs; the worker process is what executes them.
- Real API keys. In `apps/web/.env.local` (or exported in the worker's shell — both processes
  read the same env var names):

  ```bash
  # Companion feature flags — all three surfaces are demoed, so all three are on.
  FLAG_COMPANION=true
  FLAG_CALLOUT_DRAFT=true
  FLAG_SEASON_WRAPPED=true

  # Real keys — with either unset, the corresponding surface degrades silently (banter/recap
  # render nothing; the draft button toasts a failure) rather than erroring, so double-check
  # these are actually set if a surface stays empty.
  XTRACE_API_KEY=<real key>
  XTRACE_APP_ID=receipts-hackathon
  ANTHROPIC_API_KEY=<real key>
  ```

## 2. Seed the world

```bash
cd apps/web
DATABASE_URL=postgres://receipts:receipts@localhost:5432/receipts \
  npx tsx scripts/demo/seed-companion-demo.mts
```

Prints (and this is the ONLY output you need to copy for later steps):

```json
{
  "chalkProfileId": "...",
  "chalkHandle": "chalk_daddy",
  "chalkSlug": "chalk-daddy",
  "fadeProfileId": "...",
  "fadeHandle": "fade_the_public",
  "fadeSlug": "fade-the-public",
  "seasonId": "...",
  "pairingIds": { "week1": "...", "week2": "...", "week3": "...", "active": "..." }
}
```

This creates two claimed rivals (`chalk_daddy` — plays favorites; `fade_the_public` — bets
against the crowd), a nemesis season, three CONCLUDED weeks between them (alternating winners,
the third a rematch, each with both sides' narration lines populated) plus one ACTIVE week for
right now, and 9 pairing-thread posts with quotable trash talk across those weeks. Re-running
the script is safe — it detects the existing world (by `chalk-daddy`'s slug) and just reprints
the same ids instead of inserting a second copy.

**Note:** the seeded season is still RUNNING (`ends_on` is ~9 weeks out) — this is deliberate,
so step 4's recap job needs the `seasonId` above passed explicitly (see why in that step).

## 3. Ingest rivalry memory into xTrace

Run from a SEPARATE terminal than the worker's own `pnpm --filter worker dev` — this script
opens its own short-lived connection to send the job, so it needs `DATABASE_URL` in ITS shell
too, independent of the worker process's:

```bash
DATABASE_URL=postgres://receipts:receipts@localhost:5432/receipts \
  node apps/worker/scripts/run-companion-ingest.mjs
```

Enqueues `companion:ingest` (XH-T5); the running worker picks it up and ships the three
concluded weeks' verdicts (both sides) plus all 9 thread posts into xTrace as facts/episodes —
this is what banter and callout drafts search over. Safe to re-run (idempotent via
`companion_ingest_log`); give it a few seconds to complete before moving on (check the worker's
log line: `companion:ingest complete`).

## 4. Sign in as each rival and hit `/rivals`

The seeded profiles are `claimed` but have no real login (no email/OAuth was ever attached) —
mint an Auth.js database-session cookie directly, the same technique
`apps/web/scripts/screenshot-tour/seed-session.mts` uses for its own seeded profile, parameterized
here by slug. Save this once as a scratch script **inside `apps/web`** — it imports workspace
packages (`@receipts/db`, `drizzle-orm`), which only resolve from somewhere under the monorepo's
own `node_modules` tree; saving it to `/tmp` (outside the repo) fails with
`ERR_MODULE_NOT_FOUND: Cannot find package 'drizzle-orm'`. This file is scratch/uncommitted —
delete it once the demo is done:

```bash
cd apps/web
cat > scripts/demo/mint-demo-session.mts <<'EOF'
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { connect, profiles, sessions, users } from '@receipts/db';

const slug = process.argv[2];
if (!slug) throw new Error('usage: tsx mint-demo-session.mts <profile-slug>');

const { pool, db } = connect();
const userId = randomUUID();
await db.insert(users).values({
  id: userId,
  email: `demo-${slug}-${randomUUID()}@example.test`,
  ageAttestedAt: new Date(),
});
await db.update(profiles).set({ userId }).where(eq(profiles.slug, slug));
const sessionToken = randomUUID();
await db.insert(sessions).values({ sessionToken, userId, expires: new Date(Date.now() + 30 * 86_400_000) });
console.log(sessionToken);
await pool.end();
EOF

DATABASE_URL=postgres://receipts:receipts@localhost:5432/receipts npx tsx scripts/demo/mint-demo-session.mts chalk-daddy
DATABASE_URL=postgres://receipts:receipts@localhost:5432/receipts npx tsx scripts/demo/mint-demo-session.mts fade-the-public
```

Each prints a session token. In two separate browser profiles (or one normal + one incognito
window), set the cookie `authjs.session-token=<token>` for `localhost:3000` (unprefixed name —
prod builds use the `__Secure-` prefix instead, see `lib/auth-cookies.ts`), then visit `/rivals`
signed in as each rival.

**What the judges see:** the Rivalry radio panel (`CompanionBanter`) renders 1–3 lines of banter
grounded in that profile's OWN record and the just-ingested memory — generated once per profile
per ET day, so a page refresh doesn't regenerate it. Next to it, the "Call someone out" panel
shows a **Draft it** button beside the plain share button for the other rival (a call-out
candidate, derived from the concluded weeks — no extra seeding needed); clicking it drafts a
few trash-talk lines to send along with the challenge link, independent of the plain share flow
right next to it.

## 5. Generate the season recap and check `/you`

```bash
DATABASE_URL=postgres://receipts:receipts@localhost:5432/receipts \
  node apps/worker/scripts/run-season-recap.mjs <seasonId>
```

Use the `seasonId` printed in step 2 — **the explicit id is required here**: the seeded season
is still running, so `companion:season-recap`'s default "most recently ENDED season" resolution
(XH-T8) would find nothing. Passing an explicit id skips that check entirely (a named season may
still be running, and that's fine). Give it a few seconds, then visit `/you` signed in as either
rival: a "Season wrapped" section renders the stored recap (title + a few paragraphs) plus the
same AI-generated-color disclaimer the banter panel shows, straight from the database — no
client-side fetch, since it's pre-generated.

## 6. Reset (re-run the demo from a clean slate)

Only the two companion tables need truncating — the seeded rivalry world itself
(`profiles`/`seasons`/`nemesis_pairings`/`posts`) is reusable across runs:

```sql
TRUNCATE companion_artifacts, companion_ingest_log;
```

Then repeat from step 3 (ingest again — it's now working from an empty ingest log, so everything
re-ingests) through step 5 (recap regenerates since its cache key was just cleared). No need to
re-run step 2's seed or re-mint sessions.

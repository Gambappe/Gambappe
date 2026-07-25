# Integrating with xTrace — an operational guide

Audience: an agent implementing against xTrace. Written to be read once, before writing code.
Every rule here was verified against the live API; the measurement behind each is in `§Evidence`.
Companion document: `docs/xtrace-episode-retrieval-findings.md` (methodology and raw results).

**Read `§1` and `§2` before choosing to use xTrace at all. Most misuse is picking it for the
wrong job, not calling it wrong.**

---

## 1. Decide whether to use it

xTrace is an LLM-extraction memory layer, not a database. It converts prose into `fact` and
`episode` records and answers semantic queries over them.

| Use it for | Do **not** use it for |
| --- | --- |
| Claims true across many records, present in none of them | Retrieving what a record explicitly says |
| Normalising informal/oblique phrasing into retrievable claims | A system of record (see retention, below) |
| Detecting and articulating that something *changed* | Anything latency-sensitive (~1–1.7 s/query) |
| Subjective colour, personality, narrative | Safety-critical facts (allergies, medical, money, legal deadlines) |
| Cached, batch, or async surfaces | Per-keystroke or real-time paths |

Two hard numbers that decide most cases:

- **Retention is ~11/16 and non-deterministic.** If a dropped record is a bug rather than one
  fewer nice-to-have, do not make xTrace authoritative.
- **Ingest→retrievable is 5–8 minutes.** If a write must affect the next read, xTrace cannot be
  the serving path. Put a write-through buffer in front of it or use a different store.

Against a pgvector baseline it **loses** at retrieving stated content (2/3 vs 3/3), **ties** on
knowing current state, and **wins decisively** on cross-record inference (3/4 vs 1/4) and on
articulating change (4/4 vs 1/4). Choose accordingly.

## 2. Endpoints and auth

**Base URL:** `https://api.production.xtrace.ai`
**Auth:** `x-api-key: $XTRACE_API_KEY` on every call.
**You do not need** `XTRACE_ORG_ID` (stale; derived from the key) or `XTRACE_ADMIN_KEY` (knowledge-base
management only, which the memory API does not use).

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/v1/memories` | Ingest. **Async** — returns `{object:"ingest_job", id, status:"pending"}` |
| `POST` | `/v1/memories/search` | `query` is **required**. `include ⊂ {fact, artifact, episode}`. `mode: retrieve\|compose` |
| `POST` | `/v1/memories/trigger` | Procedural recall. `action` must be an **object**: `{tool, input}` |
| `GET` | `/v1/memories/{id}` | Single record |
| `GET` | `/v1/memories` | List. **Ignores `group_ids`** — returns app-wide. Debug only |
| `POST` | `/v1/groups` | Returns a server-issued `grp_…` id |
| `GET` | `/v1/usage` | Quota and storage counts. Cheapest auth check |

**Hosts that do not work.** `api.xtrace.ai` — the Python SDK's default `admin_api_url` — is
**NXDOMAIN in public DNS**; anything needing it (`create_kb`, `list_kbs`, `create_api_key`) fails
for everyone. `mem.xtrace.ai` is a Next.js web app, not an API. Do not spend time on either.

## 3. Rules

### R1. Scope by `user_id`. Never rely on `group_ids` to reach episodes.

xTrace creates episodes with an **empty `group_ids`**, so a group-scoped search returns **zero
episodes** — and episodes are where cross-record synthesis lives. Group scoping looks correct,
returns facts, and silently drops the induction you came for.

```jsonc
// WRONG — will never return an episode
{ "query": "...", "group_ids": ["grp_abc"], "user_id": null, "include": ["fact","episode"] }

// RIGHT
{ "query": "...", "user_id": "profile-123", "group_ids": [], "include": ["fact","episode"] }
```

Use group scoping only for facts that must be shared between specific parties. For a shared pool
that needs induction, use a **synthetic pool user** (`user_id: "app:pool"`) rather than a group.

### R2. Always pass `user_id`. Omitting it searches app-wide.

`user_id: null` or omitted returns every user's memories under that `app_id`. Verified: a query
about one domain returned records from an unrelated domain. Isolation is correct *when* `user_id`
is supplied — another user's id returns 0 rows, an unrelated id returns 0 rows.

### R3. Reserve slots for episodes, or truncation drops all of them.

The API returns **every fact before any episode**. A flat top-k slice is therefore fact-only for
any subject with k-many facts. Measured: first episode at index 9, so `slice(0, 8)` discarded 3 of 3.

```ts
function selectTopK(rows, limit, episodeSlots) {
  if (!episodeSlots) return rows.slice(0, limit);            // the trap
  const eps  = rows.filter(m => m.type === 'episode').slice(0, episodeSlots);
  const rest = rows.filter(m => m.type !== 'episode');
  const out  = [...rest.slice(0, limit - eps.length), ...eps];
  if (out.length < limit) {                                  // backfill if episodes are scarce
    const used = new Set(out.map(m => m.id));
    out.push(...rows.filter(m => !used.has(m.id)).slice(0, limit - out.length));
  }
  return out;
}
```

Or use `mode: "compose"`, which structures the payload for you (R6).

### R4. Ingest prose. Batch it. Do not clean it.

Three separate findings, all pointing the same way:

- **Prose, not notation.** Structured notation (chess PGN) extracted **0 facts from 8 complete
  records**. Render structured data to sentences first: not `{item_id: 4412, qty: 1}` but
  `"Ordered the pad kee mao again, extra chili, left the peppers."`
- **Batch by session/day.** Isolated single-message ingests get little or no extraction. Group
  several related messages into one `conv_id`.
- **Do not pre-clean.** An LLM pass that stripped conversational texture down to "just the signal"
  scored **worst of every configuration tested (2/10)**. Episodes are conversation summaries — strip
  the texture and there is nothing left to summarise. Raw informal prose scored 8/8.

### R5. Treat ingest as eventually consistent, and verify it landed.

Ingest returns `202` with a pending job. The record is retrievable **5–8 minutes** later. There is
no synchronous path.

- **Never ingest live in a demo or a request path.** Seed ahead of time.
- If xTrace is authoritative, **poll until the record is retrievable and re-ingest if it never
  appears** (retention is ~11/16). *Caveat: whether re-ingest recovers a dropped record is
  untested — verify before depending on it.*
- If a write must affect the next read, hold it in a session-local buffer and union it over query
  results.

### R6. Prefer `mode: "compose"` when the consumer is an LLM.

`compose` runs a server-side selection pass and returns an assembled `context` markdown block
**alongside** `data`. The block groups memories under generated headings and **can contain items
absent from `data`** — so consume `context`, not just the rows.

```jsonc
{ "object":"search", "mode":"compose",
  "data":[ /* rows, possibly a subset */ ],
  "context":"## Memories\n### Heading…\n- claim [recorded: …] [source: user]",
  "context_selection_applied": true }
```

Costs ~1.7 s versus ~1.0 s for `retrieve`. It scored highest on every quality axis measured.
**When scoring or counting a compose result, split `context` into lines first** — treating the
whole block as one item under-reports its content by an order of magnitude.

### R7. Fail open, always.

`search` and `ingest` must never break a render. Degrade to `[]` / `false` on any non-2xx,
timeout, or parse failure. Retention of 11/16 means a missing memory is normal operation, not an
exception.

### R8. `include` accepts exactly `fact`, `artifact`, `episode`.

Anything else returns `422 {"field":"include.0","message":"Input should be 'fact', 'artifact' or 'episode'"}`.
`artifact` returned **0 rows in every test** — do not build on it. `lesson` and `procedure` are
**not** valid here (see R9).

### R9. `lesson` and `procedure` exist, but only via `/v1/memories/trigger`, and only from tool calls.

They are invisible to `search`, to the listing endpoint, and to usage counters. Creation requires
ingesting conversations that **contain tool calls**; a `lesson` additionally requires a **failed**
attempt to contrast against. Setting `agent_id` alone does nothing.

| Ingested shape | Produced |
| --- | --- |
| user prose only | facts + episode |
| user + assistant prose, `agent_id` set | facts + episode |
| assistant narrating tool calls | facts + episode + **procedure** |
| tool calls with FAILED → SUCCEEDED | facts + episode + **procedure + lesson** |

Recall is keyed on **tool name**, not semantics:

```jsonc
POST /v1/memories/trigger
{ "action": { "tool": "book_table", "input": {"venue":"x"} },   // object, not a string
  "user_id": "profile-123", "app_id": "...", "group_ids": [], "mode": "compose" }
```

A non-matching tool name returns empty. `entities` in place of `action` returns nothing. Do not
name your own domain concept "lesson" if you also use xTrace — the collision will confuse readers.

### R10. Extraction cannot run on encrypted content.

Measured: AES-GCM ciphertext in → **0 memories**; the same six records in plaintext → **11**.
"Encrypt it and let the platform extract" is not an available design. Pick one.

## 4. Recipes

### Ingest

```ts
await fetch(`${BASE}/v1/memories`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-api-key': KEY },
  body: JSON.stringify({
    messages: dayOfMessages.map(m => ({           // batch, not one message
      role: 'user',
      content: m.text,                            // prose, uncleaned
      date: m.at.toISOString(),
    })),
    user_id: profileId,                           // the scope you will query by
    conv_id: `${profileId}:${dayKey}`,            // stable, idempotent-ish
    app_id: APP_ID,
    group_ids: [],                                // only for genuinely shared facts
    agent_id: null,
  }),
});
// → 202 {object:"ingest_job", id:"job_…", status:"pending"}  — retrievable in 5–8 min
```

### Search

```ts
const res = await fetch(`${BASE}/v1/memories/search`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-api-key': KEY },
  body: JSON.stringify({
    query: 'opening repertoire tactics form history',  // required; keyword-ish works fine
    mode: 'compose',
    user_id: profileId,                                // R2 — always
    group_ids: [],
    app_id: APP_ID,
    include: ['fact', 'episode'],
  }),
});
const { data = [], context = null } = await res.json().catch(() => ({}));
// consume `context` for LLM input; use selectTopK(data, 8, 2) if you need rows
```

### Two-tier memory (personal + pooled)

```ts
const PERSONAL = profileId;          // this user's own memory
const POOL     = 'app:pool';         // synthetic user holding anonymised shared records

await ingest({ user_id: PERSONAL, ... });   // write both
await ingest({ user_id: POOL, ...anonymised });

const [mine, pooled] = await Promise.all([
  search({ user_id: PERSONAL, mode: 'compose' }),
  search({ user_id: POOL,     mode: 'compose' }),   // induced cross-user claims live here
]);
```

A synthetic pool user, not a group — see R1.

## 5. Verify before you build

Run these in order. Do not write feature code until step 4 passes.

1. `GET /v1/usage` → `200`. Confirms the key and base URL.
2. `POST /v1/memories` with one batched conversation → `202` and a `job_…` id.
3. Wait 8 minutes. **Time this yourself; do not trust the 5–8 min figure blindly.**
4. `POST /v1/memories/search` with the same `user_id` and `include: ['fact','episode']` → expect
   non-empty `data`. If empty, extraction dropped it; re-ingest and repeat.
5. Confirm the trap: same query with `group_ids: [grp]` and `user_id: null` → expect **0 episodes**.
   Seeing this yourself prevents a whole class of later confusion.
6. If using `compose`, confirm `context` is non-null and longer than the concatenated rows.

## 6. Anti-patterns

- Using `group_ids` for anything that needs episodes → silently fact-only.
- Flat `slice(0, k)` on results → silently episode-free.
- Sending JSON/structured records as `content` → near-zero extraction.
- Pre-summarising or "cleaning" input → worst measured configuration.
- Ingesting one message at a time → little or no extraction.
- Ingesting live and reading back immediately → nothing is there for 5–8 minutes.
- Making xTrace authoritative for records that must not be lost.
- Storing safety-critical facts (allergies, dosages, deadlines, money) in it.
- Encrypting content and expecting extraction.
- Using x-vec from a browser — it is Python 3.11+ only, and the key plus homomorphic client live
  in a Python `ExecutionContext`.
- Chasing `XTRACE_ORG_ID` or `XTRACE_ADMIN_KEY` for memory-API work. Neither is needed.

## 7. Evidence

Measured July 2026 across three corpora (16, 30 and 159 records) against a pgvector baseline
(`bge-small-en-v1.5`, cosine).

| Finding | Number |
| --- | --- |
| Cross-record inference | **3/4** vs 1/4 pgvector (which tied lexical FTS) |
| Overall retrieval, betting corpus | **8/10** vs 6/10 pgvector, 4/10 FTS |
| Articulating that a preference changed | **4/4** vs 1/4 recency-weighted SQL |
| Knowing *which* preference is current | 3/3 — **tied** |
| Lexical-tier retrieval | 2/3 — **lost** to pgvector's 3/3 |
| Situation-keyed retrieval, precision@5 | **1.00** vs 0.75 (base rate 0.25) |
| Record retention | **11/16**, non-deterministic |
| Ingest → retrievable | **5–8 min** |
| Query latency | ~1.0 s `retrieve`, ~1.7 s `compose` |
| Notation (PGN) extraction | **0 facts** from 8 complete records |
| Pre-cleaned input lane | **2/10** — worst of all configurations |
| Ciphertext extraction | **0** memories vs 11 from the same plaintext |
| Group-scoped episode retrieval | **0** episodes, every query, every corpus |

**Caveat on the figures.** Scoring was regex-based against ground truth and required correction
**three times**, each time under-crediting whichever system paraphrased or reformatted its output.
One benchmark hit a ceiling at 8/8 across all four configurations — it looked like success and
measured nothing. A 2×2 of representation (prose vs pre-structured) against substrate (xTrace vs
pgvector) found **no significant difference at ~30 records**: format choice is not load-bearing at
small scale. Treat the directions as sound and the exact numbers as approximate.

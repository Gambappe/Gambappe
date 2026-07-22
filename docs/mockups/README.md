# Mockups

> **Status update:** the swipe-ballot direction below has been approved and planned —
> see [`docs/swipe-ux-plan.md`](../swipe-ux-plan.md) for the locked decisions, design
> spec, and SW task DAG.

Design explorations that are **proposals, not implemented UI**. Nothing in this
directory ships; each mock's final section maps its ideas onto the real files a
follow-up task would touch.

## `xtrace-integration.html` — Receipts × XTrace (Jul 2026)

Ten ranked ideas for folding **XTrace** (the belief-revision / procedural-memory
cloud — encrypted `x-mem` beliefs, `x-vec` search, typed provenance edges,
session briefings) into Receipts, from flagship arguments a hackathon panel would
applaud down to deliberate out-there swings. The through-line: the nightly
**fingerprint already is a belief system** — XTrace just turns the black box to
glass and lets a receipt carry the *why*, not only the *what*.

Open in a browser (self-contained, dark stage, honors `packages/ui`'s ticket
tokens; belief-violet is the only added signature). Every concept is scored
against `receipts-principles.md` P1–P12 at the end.

Contents:

- **§00 Thesis** — fingerprint ≅ belief-revision engine; the one-sentence pitch.
- **Tier 1 (flagship)** — 01 **Glass Engine** (fingerprint as an auditable belief-log),
  02 **Why-Stamp** (seal the reason, revise it on settle), 03 **Sealed by Cipher**
  (cryptographic sealed picks, reveal = decryption), 04 **Portable Receipts**
  (self-owned, cross-vendor record).
- **Tier 2 (strong)** — 05 **Morning Briefing** (session briefing as the daily drop),
  06 **Shadow Nemesis** (spar a persona of your rival's public log), 07 **Belief
  Obituary** (the engine retires a belief about you).
- **Tier 3 (out there)** — 08 **Secret-Ballot Houses** (homomorphic house tally),
  09 **Fade the Engine's Mind** (a market on your own belief drift), 10 **Persona
  Duo** (offline-partner stand-in — flagged trade-off included on purpose).
- **§A Scorecard** — P1–P12 hard-lines table; XTrace never touches money/credentials.
- **§B Build notes** — `x-mem`/`x-vec`/edges/briefing → repo delta; the one
  `BeliefReceipt` component; the 48-hour demo pick (01 + 02).

## `swipe-ux.html` — Swipe on Tomorrow (Jul 2026)

Full-experience vision for the **swipe ballot** direction (chosen over the split
ballot and other daily-question options): every question is a card you throw —
right for the positive side, left for the negative — with the entry price
stamped at release and the receipt printing from the bottom edge.

Open the file in a browser (fully self-contained — fonts embedded, no network).
Published copy: https://claude.ai/code/artifact/c727f28d-65f9-4339-8f6f-ada866424da9

Contents:

- **§01 The primitive** — swipe anatomy: threshold, tilt, world-tint, stamp
  preview, in-gesture 18+ gate, printed 60s undo, tap-well fallbacks (a11y).
  The hero frame is a working demo of the exact spec.
- **§02 The daily ritual** — 9:00 knock → noon unseal → Live Activity sweat →
  the reveal storyboard (keeps the repo's stamp-slam/crowd-fill/flip/count-up
  skeleton) → the streak obituary card (P3).
- **§03 Every surface** — honest platform map: iOS notification actions (a
  literal notification swipe is impossible; actions/widgets/Live Activities are
  the sanctioned equivalents), Android/web-push first, desktop arrow keys,
  spectator pages as ballots.
- **§04 Nemesis / §05 Duos** — the same throw carrying the rivalry week
  (sealed opponent picks, stamp-only trash talk, rematch-by-swipe) and the duo
  shared deck (sealed partner picks, chemistry, tandem receipts).
- **§06 The crowd** — concentric community: you → duo → nemesis → house
  (stretch) → the 8pm room; ghost→claim funnel strip.
- **§07 Swatches** — color directions (A1 recommended: current tokens + gold
  accent + glow states), type directions (Barlow Condensed display
  recommended), stamp language, full motion/haptics budget table.
- **§08 The name** — candidates replacing "Gambappe"/"Receipts"; recommended:
  **Called It**, runner-up **Sides**.
- **§09 Build notes** — repo delta table: one new `SwipeBallot` component,
  `PickButtons` demoted to fallback wells, token/keyframe additions, feature
  flag `swipe_ballot`, zero API/engine changes.

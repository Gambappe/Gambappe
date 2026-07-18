# Receipts — Engagement Expansion Report

**Date:** July 18, 2026 · **Inputs:** `receipts-prd.md`, `receipts-principles.md`, `receipts-mvp-v2.md`
**Question:** where can the PRD and principles be iterated to widen fun, deepen habit, and multiply social-engagement channels — for whom, through which feelings — and which of those ideas survive an honest psychological and sociological red-team?

**A framing note before anything else.** The user-facing goal is often shorthand-ed as "make it feel like gambling, everywhere." The product's own laws forbid exactly that, and correctly: Receipts is a points game; its hard lines say competition is never denominated in currency and pressure targets ego, never wallet (P10). So the design target in this report is precise: make **prediction-play** — the thrill of being on the record, the sweat of an open call, the drama of being right or wrong in front of people — pervasive *in social space*, collective *in feeling*, and habitual *in ritual*, while never becoming a gambling experience or a gambling funnel. §6 red-teams that boundary hard, because it is the single most dangerous place this product can fail.

---

## 1. Who finds this fun, engaging, and habit-forming

Seven personas, ordered by how well the current PRD serves them. Each includes the *feeling they're buying* and the habit hook that would retain them.

| # | Persona | Who they are | The feeling they're buying | Habit hook | Served today? |
|---|---|---|---|---|---|
| A1 | **The Ritualist** | Wordle/NYT-games cohort, 25–55, broad gender mix, plays daily puzzles for streak + share | Small daily competence + a streak they're afraid to lose | One tap at coffee, reveal at night | **Well** — this is the Daily Question |
| A2 | **The Group-Chat Sicko** | Has *the* chat (sports, fantasy league, college friends); lives for trash talk; may or may not bet real money elsewhere | Receipts *on their friends* — being provably right at someone specific | The chat itself; standing rivalries | **Poorly** — the app has no concept of "my group" |
| A3 | **The Tout / CT Quant** | X-native prediction-market poster; followers; unverifiable claims are their whole problem | Status via verifiable record; being ridden | Pinned profile; weekly record posts | **Partially** — profile exists, flex tooling thin (per MVPv2) |
| A4 | **The Take-Haver** | Politics/news junkie; "I said this would happen" is their currency; allergic to being memory-holed | Vindication with a timestamp | News cycle → question of the day | **Partially** — depends on category mix |
| A5 | **The Ladder Competitor** | Ex-ranked gamer (League, chess.com); wants ELO, seasons, promotion anxiety | Measured skill and climbing | Rating on the line every week | **Designed** (nemesis/duo/Glicko) but V1+ |
| A6 | **The Spectator-Lurker** | Watches drama, votes occasionally; converts late; majority of any social product | Belonging without exposure; low-stakes participation | Reveal-watching; reacting | **Weakly** — spectator surfaces are thin |
| A7 | **The Pool Commissioner** | Runs the office Oscars pool, the March Madness bracket, the World Cup sweepstake | Hosting; being the reason the group has fun | Organizing tools; seasonal events | **Not at all** — and this is a mainstream, culturally pre-approved behavior |

**Two audience insights the PRD under-plays:**

1. **The culture axis is the audience-widener, not filler.** The PRD treats category mix as variety hygiene. But awards shows, reality-TV finales, album releases, and internet-drama questions are how A1/A6/A7 — the *majority-female, daily-games-native* audiences — enter. Betting culture skews male; daily-game culture doesn't. A deliberate culture-category strategy roughly doubles the addressable temperament.
2. **The group chat is a distribution channel *and* an unserved product surface.** A2 and A7 don't need new mechanics — they need the existing daily question scoped to "us." Office pools and bracket culture prove that points-based prediction inside a bounded social group is already a beloved, mainstream, self-organizing behavior. The PRD's solo-first principle (P5) was the right *launch* constraint; it should not remain a *ceiling*.

---

## 2. Emotional palette audit

Drama is the product. Current coverage vs. the full range of feelings a prediction-social product can honestly elicit:

**Covered today:** solo pride (streaks), public loss with dignity (loss cards), rivalry (nemesis), partnership (duo, V1.5), tribal belonging (houses, stretch), suspense (lock→reveal gap), vindication (Called-it).

**Missing or thin:** collective hope/dread (no "we" moment), shared mourning/celebration (losses are processed alone), trust and being-trusted (no ride/follow), loyalty and its betrayal (no fade), witness/testimony (no way to make someone part of your call), mentorship/protective pride, redemption arcs (comebacks aren't narrated), nostalgia (no anniversaries/archives surfaced), awe/spectacle (no main events), self-recognition (no style identity), hosting pride (no tools for A7), safe schadenfreude (exists only implicitly and dangerously — see §6).

---

## 3. Proposals

Each entry: the mechanic → the feeling(s) targeted → engine tie (P6) → the principles-checklist note. Grouped by social scale.

### 3.1 Collective — the whole crowd feels one thing

**E1 · The People's Parlay (promote from parked D9 to V1.5).** The crowd builds a communal multi-leg slip by daily vote; every user chooses *ride* or *fade* before lock. A live "legs hit" saga counter. Feelings: collective hope/dread, shared fate, us-vs-probability. Engine: vote-weighting by rating; ride/fade feeds contrarianism. The single strongest "we" mechanic available, and it already passed the checklist in D9.

**E2 · Crowd vs. Market record.** A permanent, honest scoreboard: "The crowd has beaten the market 9 of the last 14 days." One line on every reveal. Feelings: collective identity, David-vs-Goliath. Engine: computed from lock snapshots already stored. Zero new mechanics.

**E3 · The communal reveal artifact.** Alongside personal result cards, mint the *day's* card: crowd split, outcome, best longshot call of the day, "63% of us were wrong together." Feelings: shared mourning/celebration — losing *together* is materially gentler than losing alone. Artifact is a door (P9) to tomorrow's question.

**E4 · Main Events.** Monthly flagship question with a bigger ceremony: countdown page, richer reveal, commemorative card ("I was there — Question XII"). Feelings: awe, occasion, being-part-of-something. This is the PRD's Question Zero pattern made recurring instead of once.

### 3.2 Small-group — the chat becomes a surface

**E5 · Rooms (private crowds).** One tap creates a room link; everyone who joins sees the *same global daily question* plus a room-scoped crowd split, standings, and weekly MVP. No custom questions (keeps one ritual, P8; keeps grading on real markets, P4). Feelings: belonging, local rivalry, hosting pride (A7's whole persona). Engine: room-relative contrarianism ("you're the house contrarian") is a fingerprint enrichment. **This is the highest-leverage proposal in this report** — it converts existing group chats into recurring distribution *and* gives A2/A7 their product.

**E6 · Ride / Fade.** On any locked pick (post-lock only, D-16): tap *ride* (I'm with them) or *fade* (I'm against them). Riders/faders get a shadow-result: "You rode fox-4821 — she hit." Feelings: trust, loyalty, betrayal-lite, parasocial participation for A6 (one tap from a side on a *person*, extending P2). Engine: ride/fade graph is a social-trust signal; realized ride-accuracy is a fingerprint axis.

**E7 · Sealed trash talk.** At pick time, optionally write one line revealed *only* at settlement — and choose its condition: "if I win" (the flex) or "if I lose" (the self-roast). Feelings: humor, suspense, banter — elicited by *structure* (pre-commitment), never demanded live, which is exactly D3's design law. The self-roast option is the loser-protagonist brand (P3) as a writing prompt.

**E8 · The Witness.** On a longshot pick (≤ 20¢), tap "call a witness" — send one person a link; if they accept, their handle is stamped on your ticket as witness. If it hits, the card mints for both. Feelings: testimony, shared vindication, "I was there when she called it." A door-shaped invite (P9) that isn't a generic referral.

**E9 · The Corner.** Opt-in mentorship pairing: a veteran (50+ picks) "corners" a rookie for their first two weeks; the rookie's milestones stamp the mentor's record ("cornered 3 rookies to their first streak"). Feelings: protective pride, gratitude, being-shown-the-ropes. Strictly encouragement + shared artifacts — no advice feed (see §6.8).

### 3.3 Identity — the self, narrated

**E10 · Style titles.** The fingerprint already computes chalk affinity, contrarianism, category profile — surface them as seasonal titles: *The Contrarian. Chalk Merchant. Deadline Artist. Culture Specialist.* Feelings: self-recognition, being-seen (the horoscope effect, used honestly — titles derive from real behavior). Engine-native by construction.

**E11 · Redemption arcs.** The engine detects and narrates comebacks: bounce-back rate as a stat, "busted at 6, rebuilt to 9" as a card, drought-broken as a beat. Feelings: resilience, second-chance hope — psychologically the strongest story shape available, and currently the app narrates only first-order wins/losses.

**E12 · On This Day.** "A year ago today you called the election at 18¢." Resurfaces the archive as identity. Feelings: nostalgia, longevity pride. Costs a query; deposits into P7's "structures that outlive moments."

### 3.4 Spectacle — drama as content

**E13 · Rivalry spectation with a stake.** Public nemesis matchups accept spectator predictions: "who takes this week?" — a meta-question graded in-app. Feelings: safe schadenfreude, pundit-ing, the P2 dissolution of the audience (a viewer of a rivalry now has a side *in the rivalry*). Engine: meta-picks are picks.
**E14 · Reveal watch mode.** During the reveal window, the question page becomes lightly live: reaction bursts, the crowd count ticking, the stamp landing for everyone in the same 5 seconds. Feelings: collective effervescence — the Durkheim/Collins ingredient the reveal is *for*, currently experienced alone.

### 3.5 PRD / principles amendment candidates (pre-red-team)

1. **New principle P13 — "Rooms are lenses, not forks."** Private groups always view the *same* global ritual through a local lens; no room ever gets its own questions or schedule. Preserves P8 (one synchronized moment) while unlocking A2/A7.
2. **Amend P5** from "works alone" to "works alone; *slots into groups you already have*." Solo-first remains the floor; group-native becomes the explicit second story.
3. **Amend P2** to include people, not just markets: every public *pick and matchup* is also one tap from a side (ride/fade, rivalry meta-picks).
4. **Extend P3** — the loser-protagonist principle gains the *redemption* clause: every loss artifact carries a hook to the comeback arc (the busted card links to "the rebuild starts tomorrow").
5. **PRD §4.1 category strategy:** name culture/entertainment as a first-class audience-expansion axis with a weekly guaranteed slot, not filler.
6. **PRD §9 channels:** add rooms/group-chat as a first-class channel; add creator co-pick collabs ("pick against the streamer" main events).

---

## 4. Red-team — the psychology and sociology of these proposals

Adversarial review of §3 (and of the engagement goal itself), grounded in named observations from behavioral psychology and sociology. Findings ordered by severity.

**R1 · The gambling-adjacency trap is the master risk, and "pervasive" is the wrong goal on the time axis.** The mechanics above borrow from the same reinforcement machinery gambling exploits: variable-ratio reward schedules (unpredictable wins are the most compulsion-forming schedule known), near-miss effects (losing by one leg of a parlay activates reward circuitry almost like winning — E1 is a near-miss *factory*), and entrapment/sunk-cost dynamics (streaks). Points-only does not neutralize this: the behavioral loop is the same loop, and the product deep-links to real-money venues on every question page. The specific, foreseeable harm channel: a user emotionally activated by an in-app loss is one neutral-looking link from "making it real" on a venue — the app would then function as a gambling normalizer/funnel wearing a points costume, and P10's own screenshot test ("the app pushed someone to bet") fails at the *system* level even though no single screen fails it. Additionally, the product's own P8 already contains the correct counter-insight: **spikes, not drips**. Scarcity in time is the engagement design; an always-humming prediction feed would both dilute the ritual and complete the resemblance to a betting app.

**R2 · Streak psychology is double-edged: loss-aversion retains and *corrodes*.** The streak works because losing a streak hurts more than extending it feels good (prospect theory's loss asymmetry). But the same asymmetry produces streak *servitude* — documented in daily-game communities as anxiety, joyless maintenance, and rage-quit churn at the break point. The biggest churn cliff in any streak product is the day after a long streak dies. E11 (redemption) helps, but only if the *system* treats the break as a story beat rather than an erasure.

**R3 · "Loser is the protagonist" assumes consented performance; imposed publicity is humiliation.** Goffman's face-work: banter and self-mockery are safe only inside symmetric relationships where face can be restored. A *self-published* loss card is style; an *app-published* loss leaderboard ("hall of pain"), a fade-count on your profile, or narration that names you as the week's biggest bust is public shaming — asymmetric, unconsented, face-destroying. The line between the brand ("losing publicly with style") and the harm (being made a spectacle) is exactly the line between *the user presses share* and *the system does it to them*.

**R4 · Fade mechanics manufacture betrayal — that's the fun and the harassment vector.** E6's fade is structurally a public declaration of "you're wrong," which between friends is banter and between strangers is a challenge. Two failure modes: (a) dyadic pile-ons — one visible user faded by a mob is a dogpile with deindividuation dynamics (individual accountability dissolves in the crowd); (b) fade-counts as ambient hostility on ordinary users' profiles. Sociologically, ride is prosocial at any scale; fade is only safe either aggregated ("2,431 faded this call" — the number is drama, the list is a target sheet) or inside consented relationships (rooms, rivalries).

**R5 · Rooms import group pathologies along with group joy.** Bounded groups create fixed status orders; the member who is last in the room standings every week doesn't banter — they disengage (esteem-relegation), and small rooms make absence conspicuous ("dead chat" shame transfers to the app). Cumulative standings are the culprit: they freeze early luck into permanent hierarchy.

**R6 · Meta-prediction on people (E13) turns persons into markets.** Spectators predicting *who wins the rivalry* is one step from an audience wagering on two people's public performance — with the psychological weight landing on the two people. For opted-in competitors at small scale it's drama; at follower-scale asymmetry (a tout vs. a nobody) it's an audience betting against a human being who can read the number.

**R7 · Style titles risk identity-lock.** Labeling theory: people conform to assigned labels. "The Contrarian" who starts picking contrary *to keep the title* has had their behavior distorted by the mirror — which also poisons the fingerprint the title came from. Titles must be descriptive, seasonal, and easy to shed, or they become costumes that corrupt the data.

**R8 · Mentorship in a betting-adjacent product drifts toward tout-ism.** Any channel where a "veteran" advises a "rookie" what to pick recreates the unverified-tips economy the product exists to discredit — and flirts with the feel of betting advice. The Corner is safe only as encouragement + witnessed milestones, never as a picks-guidance channel.

**R9 · Collective identity needs a win condition it can survive losing.** Social identity theory says us-vs-them (crowd vs. market) cements belonging — but the market is *usually right*; a "war" framing dooms the collective to a losing record and learned helplessness. The framing must be curiosity/expedition ("when does the crowd see what the market doesn't?") where rare wins are treasured upsets, not a standings war the crowd loses.

**R10 · Collective effervescence requires focus, and every added mode fragments it.** Collins' interaction ritual chains: shared attention + synchronized emotion is what charges symbols (the reveal, the ticket) with meaning. Each parallel surface (rooms, parlay, rivalries, main events) competes for the same attention budget. The design must make every mode *converge on the same daily moment* rather than multiply moments — additions should deepen the spike, never smear it (this is P8 restated as a sociological law).

**R11 · The habit ceiling is also an ethics ceiling.** Self-determination theory: durable, healthy engagement runs on autonomy and competence; obligation-flavored engagement (guilt streaks, FOMO pressure, re-engagement nags) produces resentment and press-worthy backlash — especially for a betting-adjacent brand where "engineered compulsion" is the waiting headline. The healthy target is precise: **two brief voluntary touches a day** (pick; reveal), rooms/rivalries riding inside those touches. A product this shaped should *publish its own ceiling* — session-frequency and post-loss-behavior health metrics with alarms — as both a genuine safeguard and, honestly, a brand asset.

**R12 · Demographic tone risk.** Trash-talk-forward defaults read as hostile to exactly the audiences (A1, A6, culture-category players) the widening strategy targets; betting culture's ambient masculinity is a known moat *against* mainstream adoption. The drama palette must default to warm registers (suspense, wit, redemption, shared fate) with adversarial registers (fade, trash talk) opt-in and consent-gated.

---

## 5. Refined proposals — after the red-team

### 5.1 Disposition of every proposal

| Proposal | Verdict | Refinement forced by §4 |
|---|---|---|
| E1 People's Parlay | **Keep, with a near-miss rule** | Ride/fade both graded and narrated; a lost final leg is narrated as the *crowd's* near-miss (shared, comic), never as an individual's "so close — go again" prompt (R1: no post-loss escalation hooks, ever) |
| E2 Crowd vs. Market | **Keep, reframed** | "Expedition" framing (R9): a lifetime log of the crowd's upsets over the market — treasured rarities, not a win-loss war |
| E3 Communal reveal artifact | **Keep as-is** | Strengthened by R2/R3: it's the mechanism that makes losing collective and therefore gentler |
| E4 Main Events | **Keep as-is** | Converges attention on one moment — R10-positive by construction |
| E5 Rooms | **Keep — flagship — with anti-hierarchy rules** | Weekly-reset standings only (no cumulative room table); rotating spotlights (best call / gutsiest loss / comeback of the week) so the floor rotates (R5); rooms are consent spaces where fade and trash talk unlock (R4, R12) |
| E6 Ride / Fade | **Split** | Ride ships globally (prosocial at any scale). Fade ships only (a) aggregated above a follower threshold — count visible, list private — and (b) named-fade only inside rooms/rivalries where consent is structural (R4) |
| E7 Sealed trash talk | **Keep, room/rivalry-scoped** | Pre-commitment structure is exactly right (P1); scope to consent spaces; self-roast variant promoted as the default suggestion (R3, R12) |
| E8 The Witness | **Keep as-is** | Pure prosocial testimony; the invite-shaped door survives review untouched |
| E9 The Corner | **Keep, narrowed** | Encouragement + milestone co-artifacts only; no pick-visibility before lock, no advice surface (R8) |
| E10 Style titles | **Keep, seasonal + shed-able** | Recomputed each season from behavior, displayed as "this season you played like…", never a permanent badge (R7) |
| E11 Redemption arcs | **Keep — promote to core** | R2 makes this *the* retention answer: the streak-break flow becomes a designed beat (the busted card + "the rebuild starts tomorrow" + bounce-back stat), turning the biggest churn cliff into the best story |
| E12 On This Day | **Keep as-is** | Cheap, warm, archive-activating |
| E13 Rivalry meta-picks | **Modify heavily** | Opt-in per pairing (both players consent to spectator picks); crowd side shown to spectators, aggregate only shown to players; auto-off at follower-asymmetry (R6) |
| E14 Reveal watch mode | **Keep as-is** | This *is* interaction-ritual design (R10) — the highest emotional-yield surface per engineering hour |

### 5.2 Refined principle amendments

- **P13 (new) — Rooms are lenses, not forks.** As proposed, unchanged — it survived review because it encodes R10.
- **P14 (new) — Consent scales the drama.** Adversarial mechanics (fade-by-name, trash talk, spectator stakes on people) exist only inside consent structures: rooms, accepted rivalries, opt-ins. Outside them, drama is aggregate and anonymous. *Test: can the target of this feeling turn it off?*
- **P15 (new) — Never escalate on a loss.** No mechanic, notification, or copy may increase engagement pressure in response to a loss — losses resolve into story (redemption arc), never into "go again" (R1). This belongs beside the hard lines, not among the tastes.
- **Amend P3** with both refinements: loser artifacts are *self-published* (R3) and every loss carries its redemption hook (R2).
- **Amend P5** — "works alone; slots into groups you already have" — survived unchanged.
- **Amend P8** with the corollary the red-team surfaced: **pervasive in social space, scarce in time.** Presence in your chats, your feed, your rivalries — while remaining two voluntary touches a day. This sentence resolves the report's central tension and should go in the principles doc verbatim.
- **New health guardrail (ops, hard-line-adjacent):** publish internal engagement-ceiling metrics — median daily sessions (alarm > 4), post-loss venue-link clickthrough (alarm on *any* correlation between in-app losses and outbound venue clicks), streak-break D7 churn. The venue-click-after-loss metric is the system-level P10 test made measurable (R1, R11).

### 5.3 Refined conclusions

1. **The audience widener is temperament, not volume.** Rooms + culture-category strategy + warm-register defaults target A1/A2/A6/A7 — the mainstream, mixed-gender, daily-games temperament — while the tout/ladder personas (A3/A5) are served by the already-designed V1 features. The PRD's current center of gravity (betting-culture X) is the *seed* audience, not the market.
2. **The three highest-leverage additions, post-red-team:** Rooms (E5) — converts existing social graphs into distribution and gives the commissioner persona a product; Redemption arcs (E11) — converts the single biggest churn cliff into the brand's best story; Reveal watch mode (E14) — converts the existing ritual's peak moment from solitary to collective at minimal cost. All three deepen the one daily spike rather than adding surfaces (R10-compliant).
3. **The emotional palette strategy:** default registers are suspense, wit, shared fate, redemption, testimony; adversarial registers (fade, trash talk, schadenfreude) are real and valuable but live exclusively inside consent structures. Full-range drama, consent-scaled intensity.
4. **The pervasiveness doctrine:** Receipts should be *everywhere socially* — in the group chat's standings, the tout's pinned profile, the rivalry thread, the watch party — and *rare temporally*: one pick, one reveal, per day. That scarcity is simultaneously the engagement mechanism (appointment + spike), the differentiation from betting apps, and the ethical position. The product should say this about itself, publicly.
5. **The line that may not be crossed, restated as design law:** the machinery of anticipation is shared with gambling; what must never be shared is the *escalation loop*. No mechanic responds to a loss with an invitation to intensity — not more picks, not a nudge, not a venue link with warmer styling. P15 and the post-loss-clickthrough alarm are the enforcement; the redemption arc is the alternative answer to the same emotional moment.

---

## 6. Suggested next steps

1. Take P13–P15 and the two P3/P5/P8 amendments to the principles doc as proposed decisions (D-31…D-35 format), so the engagement expansion is governed before it is built.
2. Sequence Rooms → Redemption arcs → Reveal watch mode as the V1.5/V2 engagement track (after the MVPv2 loop fixes — a working share loop is a prerequisite for Rooms to distribute).
3. Prototype People's Parlay and Ride behind flags for a season of data before any adversarial mechanic (fade, meta-picks) ships anywhere.
4. Stand up the engagement-health dashboard (sessions ceiling, post-loss venue clickthrough, streak-break churn) *before* the engagement track ships — measure the ethics from day one.

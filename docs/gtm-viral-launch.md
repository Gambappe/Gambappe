# Receipts — Viral launch GTM: "Question Zero" at the World Cup final

**Status:** proposal · **Author:** growth/CMO pass · **Date:** July 18, 2026 (night before the final)
**Companion docs:** `receipts-prd.md` §9–§11 (distribution, metrics, phasing), `receipts-principles.md` (P1–P12)

---

## 0. The clock, first

The final is **Spain vs Argentina, Sunday July 19, kickoff 12:00 PM PT / 3:00 PM ET** at
MetLife Stadium. From San Jose tonight, that is **~15 hours away**. This document is
therefore written as a run of show, not a strategy memo. Everything in it is doable by one
or two people with phones, a laptop, and about $40.

The product is ready for this. The workstream registry shows every task through P1.5
`done` — the golden loop (Daily Question → ghost pick → price stamp → reveal → share card →
spectator page) is built and e2e-tested. The PRD already names this exact moment as the
launch (§9: *"Question Zero at a major cultural moment (the World Cup final on Sunday is
the immediate candidate: one question, one global reveal). One spectator URL is the
campaign."*). The only gap between the repo and the campaign is a production deploy and a
seeded question.

## 1. Why this specific final is an unfair advantage

Nothing is "destined" to go viral (see §9 for the honest version), but this is the closest
thing to a rigged table we will ever get:

- **The GOAT's last dance.** Messi, 39, leading the tournament with 8 goals, in what
  everyone expects to be the last World Cup match he ever plays.
- **The heir apparent.** Lamine Yamal, 19, on the other side. In 2007 Messi was
  photographed bathing baby Yamal for a charity calendar. That photo is already legendary
  internet lore and will be posted approximately one billion times tomorrow.
- **The market vs the heart.** The books slightly favor **Spain**; the planet's heart says
  **Messi**. That divergence — what the market says vs what people *want* — is literally
  our product rendered as a news story. No other app can turn that tension into a
  one-tap artifact.
- **Noon PT on a Sunday, in America.** The first men's final on US soil in the
  social-media era, at a watch-party-friendly hour. Plus the first World Cup halftime show
  ever (Madonna, Shakira, BTS, Bieber, Burna Boy) — a guaranteed mid-match meme window.
- **San Pedro Square is the official Bay Area watch party.** The Earthquakes' "Soccer
  Celebration" at San Pedro Square Market has drawn **400,000+ fans** over the tournament;
  the final is its closing day (free with RSVP). The crowd is already assembled. We just
  have to show up with a QR code and a microphone.

Also true and worth saying out loud: at 2:50 PM PT tomorrow, hundreds of millions of
people will say *"I called it."* Roughly half of them will be lying. We are the app that
checks. That single sentence is the campaign.

## 2. Campaign architecture: one question, one URL, three acts

Do not launch "the app." Launch **one question**:

> **Who lifts the trophy — Spain or Argentina?**
> *(Settles on the official winner; extra time and penalties count. Graded from the
> Kalshi/Polymarket market resolution — say this on the page to pre-empt the "it was a
> draw at 90 minutes" dispute.)*

Everything — every post, QR code, group-chat paste, and interview — funnels to the **one
spectator URL** for Question Zero. No homepage tour, no waitlist, no app store, no email
gate. A stranger taps the link, sees the live market price, taps a side, and owns a
price-stamped receipt in under five seconds, no signup (ghosts, PRD §3). This is the whole
funnel. Protect it with your life.

The campaign has three acts, and the product has a built-in second and third act that
normal launches don't:

| Act | When | The moment | The content |
|---|---|---|---|
| **I — The stamp** | tonight → 11:59 AM PT | Everyone locks a side at a live price before kickoff | "Get your receipt before kickoff" — group chats, X, Reddit, QR at the watch party |
| **II — The reveal** | full time (~2 PM, ~3 PM if pens) | One synchronized reveal; half the internet's receipts die publicly | Filmed at San Pedro Square: the phones-lighting-up shot, loser interviews |
| **III — The obligation** | Monday 9 AM | Streaks are live; **nemesis assignments land** (PRD §4.2 cadence) | "The app assigned me an enemy" content, Product Hunt / Show HN with real traction data |

Act III is the strategic one: the final recruits, but Monday's nemesis assignment is why
Sunday's ghosts come back (P7: moments recruit, structures retain). Every claimed user
from Sunday wakes up Monday with a rival and a storyline. That's the retention hook baked
into the calendar for free.

## 3. Run of show (all times PT)

### Tonight (before ~1 AM)

**Ship (owner: whoever has the Vercel login):**
1. Production deploy per design doc §18: Vercel (web) + worker + Postgres + Upstash.
   Free-tier specifics and landmines in §8 below. CI already deploys staging on main;
   prod is a manual promotion.
2. Run migrations, seed **Question Zero** against the live Kalshi "World Cup winner —
   Spain/Argentina" market (Polymarket as divergence flavor if both listed, PRD §6.1).
   Lock time = **12:00 PM PT kickoff**. Open picks **tonight** — "picks open now" is
   tonight's post.
3. Smoke test *on a phone, on cellular*: open spectator URL → tap side → see stamped
   price → share card → paste into iMessage/WhatsApp/X DM and confirm the OG card
   unfurls. The unfurl **is** the ad; if it's ugly or missing, fix that before sleeping.
4. Run the e2e golden-loop suite and the load-test script against prod
   (`pnpm e2e`, `pnpm load-test`) — the only launch-killing scenario is a broken pick
   flow at noon. Feature-flag off anything wobbly; PRD §11 explicitly blesses launching
   with the Daily Question alone.
5. Instrument PostHog (free tier): `spectator_view`, `pick_made`, `card_shared`,
   `card_click_in`, `ghost_claimed`, per-channel UTMs (`?src=qr-spsq / x / reddit /
   tiktok / gc`). The QR poster gets its own link. You cannot run Monday's decisions —
   or Monday's data post — on vibes.

**Prep (owner: whoever is going to the watch party):**
6. **RSVP Soccer Celebration at San Pedro Square now** (free, capacity is real — the
   Mexico–England party got relocated for crowd size; check the venue morning-of).
7. Print at a 24h FedEx Office: 2× handheld QR signs (copy in Appendix A.5) + ~50
   receipt-styled QR cards to hand to people you film. Buy a date stamp (~$10) and, if
   findable tonight, a $40 thermal receipt printer (the physical-receipt prop, §4).
8. DM the San Pedro Square Market / Earthquakes socials: "we're two local builders
   launching a free prediction game at your final watch party, filming fan reactions,
   happy to tag you" — permission-ish + a potential repost from accounts with real local
   reach.
9. Pre-write the full X scenario bank (drafts in Appendix A.2) and schedule tonight's
   launch post.

### Sunday morning (8–11 AM)
- 8:00 — X morning post with the **live price** filled in ("The market says [56¢] Spain.
  The planet says Messi.").
- 8:15 — Personal-network blast: paste the group-chat message (A.4) into **every** group
  chat you're in. Sports chats, family chats, work Slack #random. This is the highest
  conversion channel we own; the card unfurl does the selling. Ask the first 20 friends
  to pick *and* re-paste into one chat of theirs.
- 8:30 — Reddit: post the builder story to **r/SideProject** (title in A.3). Comment (as
  a human, not a brand) in the r/SanJose watch-party thread. Do **not** link-drop in
  r/soccer or r/sportsbook — see §5, Reddit rules.
- 9:00 — IG/TikTok teaser clip #0: 20 seconds, "we built an app in 48 hours to end
  'I called it' guys forever; today is its first World Cup final," phone-screen demo,
  link in bio.

### At San Pedro Square (10 AM–12 PM) — full playbook in §4
Arrive 10 AM (the final crowd will be enormous). Film the pregame content: pick
montage, crowd-split bit, QR sign cameos. Get 30+ on-camera picks.

### During the match (12–3 PM)
One person runs the X account as the deadpan narrator (voice rules in §5): pre-written
scenario posts with live numbers dropped in — Messi goal, Yamal goal, red card, halftime
show, extra time, penalties (the jackpot scenario: live market swings = receipts dying
and resurrecting in real time). Screenshot the in-app crowd split vs the market price
whenever they diverge. Film the crowd at every big moment — **film the crowd, not the
broadcast screen** (rights, §7).

### Full time (~2:00, or ~3:15 with extra time + pens)
- The reveal fires (manual settlement is fine — admin tooling exists; PRD §11 blessed it).
- **Film the reveal**: the wide shot of phones lighting up with results at once is the
  single most valuable clip of the day — it's the product's thesis in one image.
- Immediately work the losing side with the mic and the DECLINED stamp (§4). Losers first;
  winners are boring (P3).
- **Post the first TikTok within 90 minutes of full time.** Speed beats polish; the trend
  window for final-reaction content is hours, not days.
- X verdict thread: outcome, crowd split, best longshot receipt, worst beat, link.

### Sunday night
- Data recap graphic ("[N] receipts stamped · crowd said [61/39] · the market said
  [56/44] · [P]% of you survived") + "the Daily Question continues tomorrow, 9 AM. Your
  streak is 1. Don't lose it." — the retention post.

### Monday
- 6:00 AM — **Product Hunt** launch with real numbers in the first comment ("launched at
  the final; [N] picks in 24h, no signups required"). PH loves traction stories over
  feature lists.
- Morning — **Show HN** ("Show HN: Receipts – prediction game stamped with live
  Kalshi/Polymarket prices; launched at the World Cup final").
- Nemesis assignments land → the day's content beat: "the app just assigned me an enemy."
  Post your own matchup card from the official account; DM early power users asking them
  to post theirs.
- The Reddit data post (A.3): crowd-vs-market minute-by-minute chart → r/dataisbeautiful
  + r/PredictionMarkets. OC data porn is the one form of self-promo Reddit celebrates.
- Send the two partnership emails (§6, Kalshi/Polymarket).

## 4. The San Pedro Square playbook

**The bit: "The Receipts Department."** Two people, office-core energy at a soccer party —
lanyard, clipboard, date stamp. You are not influencers; you are *the pettiest civil
servants alive*, there to keep the official record. Deadpan is the joke. It's cheap,
distinctive, filmable, and it *is* the brand metaphor walking around in person.

- **Pregame:** "Excuse me — do you have a receipt for that opinion?" People tap the QR,
  pick a side on their phone, state name/side/price to camera in five words. Stamp their
  hand or their printed mini-receipt **VERIFIED**. Hand them the QR card ("your receipt is
  live at this link").
- **The board:** if the thermal printer materialized, print each pick as a physical
  receipt and pin it to a small "WALL OF RECEIPTS" foam board. People pose with their
  receipts unprompted. This is the photogenic centerpiece and costs $40.
- **Full time:** find the losing side. Mock-solemn post-match interview: "Sir, this is
  your receipt. Argentina, 44 cents, 11:42 AM. Talk us through it." Stamp it **DECLINED**
  on camera. Offer the winner's smugness 10 seconds max. The pain is the content; the
  stamp is the punchline; the receipt on screen is the product placement.
- **The wide shots:** crowd split ("Spain, make some noise… Argentina…"), the reveal
  moment, the QR sign held up during goal celebrations in the background.

**Ground rules (also see §7):**
- It's an official, Earthquakes-run event — stay **mobile** (mic + phone + sign), no
  table/booth unless the Market says yes to the DM. If staff asks you to stop, smile and
  move to the plaza edge. The bit works anywhere there's a crowd.
- On-camera verbal consent from every identifiable interviewee ("cool if this goes on
  our TikTok?") + a one-line printed release they initial for anyone featured close-up.
  Skip anyone who declines, skip anyone who looks under 21 (our audience is 18+ by hard
  line; the buffer is deliberate).
- Film the crowd and your props — never the broadcast screen as the focus, no FIFA
  logos/marks in your graphics, don't imply affiliation with the event.

**Shot list (in priority order):** (1) phones-at-the-reveal wide shot · (2) 3–4 loser
interviews w/ DECLINED stamp · (3) pregame pick montage, 10+ rapid cuts · (4) crowd-split
cheer bit · (5) wall of receipts timelapse · (6) QR sign cameo during a goal ·
(7) builder b-roll (you two, laptop, "it's live" moment) for the 48-hours story.

## 5. Platform playbooks

**Brand voice (all channels):** the account is a *records office with a heart*. Three
rules: (1) deadpan bureaucrat — no exclamation marks, no hype adjectives; (2) a number in
every post — the app narrates data so users don't have to perform (P1); (3) never mock a
loser meanly — **we are the losers** (P3); the account posts its own picks and its own
losses ("The official account is 0–1. The archive remembers everyone.").

### X — the narrator (primary channel, run live all day)
The account live-narrates Question Zero like a wire service covering a heist. Pre-written
scenario bank (A.2), numbers dropped in live: crowd split vs market price, points moved
per minute, receipts alive/dead. Pin the launch thread. Reply-bait honestly: "reply with
your pick — screenshots don't count, links do." Quote-tweet the best/worst receipts
(with the handle-owner's blessing). Tag @Kalshi / @Polymarket when citing their prices —
one ecosystem retweet from either is worth more than everything else we post (§6).

### TikTok / Reels / Shorts — the film crew
Three formats, 3–5 clips total, first one live within 90 min of full time:
1. **Receipts Department interviews** (pregame confidence → full-time grief, DECLINED
   stamp as the punchline).
2. **The reveal crowd shot** ("3,000 phones finding out at the same time who actually
   called it").
3. **The builder story** ("we built this in 48 hours; today it met the World Cup final")
   — the build-in-public genre reliably travels, and it's the honest frame for HN/PH too.

Caption hygiene: platforms suppress gambling-adjacent reach. Never use *bet, betting,
odds, gambling, parlay* in captions/text overlays. Our vocabulary is genuinely better
anyway: *prediction, called it, receipts, the market*. "No money — just receipts" is
both our legal posture (P10) and our platform-policy armor. Say it in every video.

### Reddit — participate, don't promote
Reddit detects and destroys astroturf; it rewards two things: builder honesty and
original data.
- **Do:** r/SideProject + r/webdev tonight (builder story, title A.3); r/SanJose as a
  human in the watch-party thread; **Monday's OC data post** (crowd vs market,
  minute-by-minute — r/dataisbeautiful) which is our real Reddit play;
  r/PredictionMarkets honest show-and-tell (small sub, exact ICP).
- **Don't:** link-drop in r/soccer, r/Barca, r/sportsbook (self-promo bans; instant
  removal + brand damage); never touch vote manipulation; don't reply to criticism
  defensively — upvote it and fix the thing.

### Group chats (iMessage / WhatsApp) — the actual viral channel
Sports virality lives in group chats, not feeds. The OG card unfurl is the product demo.
Paste message in A.4; the psychological hook is universal: **every chat has The Guy who
claims he called 2022.** "Send this to The Guy" is the sharpest CTA we have. Both
founders blast every chat at 8:15 AM; measure `?src=gc`.

### Instagram — low priority
Stories with link sticker + cross-posted Reels. Don't spend scarce hours here today.

## 6. Monday and week one — turn the spike into a machine

1. **Product Hunt + Show HN with traction, not promises** (Monday, §3). The builder
   story ("48-hour build, launched at the final, here's the architecture") is genuinely
   interesting to HN — link the design doc's stack, take the licensing questions
   head-on (we never touch money; hard lines doc).
2. **The creator wedge (PRD §9): 20 DMs.** Target mid-size betting/prediction X accounts
   (10k–200k) and the Kalshi/Polymarket twitter scene. Pitch is one sentence: *"Betting X
   is full of unverifiable touts — here's a public, timestamped, price-stamped record
   page; be unfalsifiable."* Their flex is our distribution, forever. Prioritize anyone
   who publicly called the final right.
3. **Venue partnerships.** Email partnerships@ at Kalshi and Polymarket (PRD §6 action
   items): we're a free social/data layer sending them warm traffic via outbound links;
   ask for referral program access + a repost of the data thread. Their DevRel accounts
   actively amplify ecosystem apps.
4. **The ritual calendar.** The final is Question Zero, not the strategy. The strategy is
   the 9 AM daily question + Monday nemesis reveals + one flagship question per cultural
   moment, run with this same playbook: **NFL kickoff (Sept) → World Series (Oct) →
   US midterms (Nov 3, 2026 — prediction markets' Super Bowl) → awards season.** Build
   the run-of-show template once (this doc), rerun it every moment.
5. **Do not ship new features this week.** Duo queue and houses are not launch content
   (P8: don't dilute the ritual). The week-one job is: daily question quality, reveal
   punctuality, share-card polish, and answering every single user who posts a card.

## 7. Rules of engagement (the boring section that prevents the bad tweet)

- **FIFA marks:** FIFA is the most aggressive rights-holder on earth re: ambush
  marketing. Never use "FIFA World Cup 26" wordmarks/logos/broadcast footage in our
  graphics, clips, or paid anything. "The final," "Sunday's final," team names = fine.
  Organic commentary is normal-people speech; just don't dress up as a sponsor.
- **Filming:** consent per §4; no minors; delete on request, cheerfully.
- **18+ everywhere:** it's a hard line in the principles and it's also good platform
  hygiene. No school-adjacent seeding, age-gate copy stays visible at claim.
- **No real-money talk from our accounts** (P10): we never post anyone's stake, never say
  "bet," never celebrate dollar wins. Points, picks, receipts, dignity.
- **Name check (PRD §12):** "Receipts" is a working title with a crowded trademark
  space. For a free PMF trial on a project domain, proceed; before paid spend or an app
  store listing, do the real search.
- **Vercel Hobby is technically non-commercial:** we're pre-revenue and trialing PMF —
  fine — but budget the $20 Pro upgrade as the *first* dollar spent if Sunday works
  (see §8).

## 8. Infrastructure: hosting the whole thing free (ish)

Design doc §18 already picked the stack (Vercel · Fly worker · Postgres · Upstash). For
the PMF trial, here's the free-tier reality, including the three landmines that would
have hurt on launch day:

| Layer | Choice | Free tier | Landmine → mitigation |
|---|---|---|---|
| Web + API + OG images | **Vercel Hobby** | Free · 100 GB bandwidth | A viral OG-image day eats bandwidth; ensure OG routes send long `Cache-Control` (they're immutable per card). ToS is non-commercial → upgrade to Pro ($20) the moment this is real. Set a spend alert, no surprise bills. |
| Postgres (+ pg-boss queue) | **Supabase free** for the trial (500 MB, always-on) | $0 | **Neon free won't work for us right now:** ~190 compute-hrs/mo, and our always-polling pg-boss worker + 60s price tick keeps compute awake ~720 hrs/mo. Either pay Neon Launch (~$19) for branching/PITR — the design-doc default once funded — or run the trial on Supabase free. Drizzle doesn't care; use the **direct/session connection string** for pg-boss (not the transaction pooler). |
| Redis (price cache, rate limits, nonces) | **Upstash free** | 500K commands/mo | Rate-limit middleware touches Redis per request; a genuinely viral day exceeds free → pay-as-you-go is ~$0.20 per 100K commands. A huge Sunday costs single-digit dollars. Let it. |
| Worker (locks, reveals, price ticks) | **Fly.io**, 1 shared-cpu-1x/256 MB | ~$2–4/mo (no real free tier anymore) | Do **not** put the worker on a free tier that sleeps (Render/Koyeb scale-to-zero = a missed reveal = the campaign's heartbeat flatlines). The Dockerfile exists; pay the $3. |
| Email (claim magic links) | **Resend free** | 100 emails/day | **This caps signups at 100/day.** Make **Google/X OAuth + passkeys the primary claim buttons** Sunday (better conversion anyway); email link is the fallback. If email demand spikes, that's a champagne problem: Resend Pro $20. |
| Analytics | **PostHog free** | 1M events/mo | Instrument tonight (§3) or fly blind Monday. |
| DNS/domain | Cloudflare registrar + DNS | ~$10/yr | DNS-only mode (grey cloud) in front of Vercel — don't double-CDN/proxy, it fights ISR caching. |
| Bot pressure | Existing §14 rate limits | $0 | If ghost-mint abuse appears, add Cloudflare Turnstile (free) on claim — not on the pick tap (never add friction to the golden path). |

**Total: launch weekend ≈ $3–15 in infra + ~$40 of props. Steady state free-ish; ~$25–45/mo
once it's working and worth paying for.** The infra bill is a rounding error — the scarce
resource tonight is hours, so anything that isn't the golden path gets the default
setting and zero yak-shaving.

## 9. Measurement, honesty, and what "worked" means

**The honest CGO note:** "destined to go viral" is not a real thing, and anyone who
promises it is selling something. What *is* real: (1) a product whose every user mints
share-ready artifacts that link back to a one-tap join page — the loop compounds even if
no single post pops; (2) a scheduled global emotional spike with prepared, platform-native
content — many shots on goal, taken fast; (3) a ritual that does this **every week**, so
one quiet Sunday doesn't kill us. The final is ignition. The engine is the daily reveal.
Judge the campaign by the loop's numbers, not by whether one TikTok hit.

**Targets for the weekend (instrument tonight, read Monday):**

| Metric (PRD §10) | Soft success | Good | On fire |
|---|---|---|---|
| Question Zero picks | 2,000 | 10,000 | 50,000 |
| Spectator → pick activation | ≥ 30% | ≥ 40% (PRD target) | ≥ 55% |
| Ghost → claimed by Monday night | ≥ 5% | ≥ 10% | ≥ 20% |
| K loop (card views → new ghosts) | > 0.2 | > 0.4 | > 0.7 |
| **D2: Sunday ghosts answering Tuesday's question** | ≥ 10% | ≥ 20% | ≥ 35% |

The last row is the only one that measures PMF rather than the event. A huge Sunday with
a dead Tuesday means we built a moment, not a product — that's a real and useful answer.
**Decision gate Wednesday:** if D2 is good → pour into the ritual + creator wedge (§6);
if activation is good but D2 is weak → the loop converts but doesn't retain: fix the
daily question's pull (question selection, reveal punctuality, streak stakes) before
spending another cent on reach.

---

## Appendix A — Copy bank (drop in live numbers before posting; [] = fill at post time)

### A.1 Launch post (tonight)
> Tomorrow at noon PT, two billion people watch Messi's last World Cup match. By 3 PM,
> all of them will claim they called it.
>
> We built the app that checks.
>
> One question. Tap a side — it's stamped with the live market price. No signup. No
> money. Just receipts. → [link]

### A.2 Scenario bank (X, during the match)
- **Morning line:** "The market opens the day at [56¢] Spain. The planet opens the day
  at Messi. One of these constituencies is about to be very smug. Picks close at
  kickoff. [link]"
- **The baby photo:** "In 2007, Messi bathed baby Lamine Yamal for a charity calendar.
  Today the baby is trying to end his career. If you called *that* in 2007, we can't
  help you — we launched too late. Everything else, we can. [link]"
- **Kickoff/lock:** "Picks are closed. [N] receipts on file. Crowd: [61/39] Argentina.
  Market: [56/44] Spain. The archive is sealed. See you at full time."
- **Messi goal:** "GOAL. Messi. 39 years old, [9] this tournament. The market moved
  [14] points in 3 minutes. [8,412] Spain receipts felt that."
- **Yamal goal:** "GOAL. Yamal. He is [19]. The torch is not being passed quietly.
  [7,102] Argentina receipts just got quieter."
- **Halftime show:** "First halftime show in World Cup history. Madonna, Shakira, BTS,
  Bieber, Burna Boy. The market did not move during any of it. Respect."
- **Red card / VAR chaos:** "VAR. The market is doing things we'd normally have to
  describe as 'emotional.' [22] points in [6] minutes. Every receipt is a live receipt."
- **Extra time:** "90 minutes were not enough to settle this. Your receipts remain
  active. Breathe."
- **Penalties (the jackpot):** "PENALTIES. This market has swung [40] points in 20
  minutes. Every receipt on earth has died and come back at least once. Nobody has
  called anything yet."
- **Full time:** "Full time. [Argentina] lift it. [61%] of you hold a green receipt and
  a 1-day streak. [39%] of you are the reason this app exists. The reveal: [link]"
- **The self-receipt (post-match):** "The official account took [Spain] at [56¢]. The
  official account is 0–1. The archive remembers everyone."
- **Night retention post:** "[N] receipts stamped today. Tomorrow, 9 AM: a new question.
  Your streak is 1. It would be a shame if something happened to it. [link]"

### A.3 Reddit / HN / PH titles
- **r/SideProject (tonight):** "I built 'Receipts' — a free game that stamps your World
  Cup final prediction with the live market price, so 'I called it' finally requires
  proof. It launches at today's final."
- **r/dataisbeautiful (Monday):** "[OC] 38,000 strangers picked the World Cup final
  winner. The crowd vs the prediction market, minute by minute."
- **Show HN (Monday):** "Show HN: Receipts – a prediction game graded by live
  Kalshi/Polymarket prices ([N] picks during the World Cup final, no accounts needed)"
- **Product Hunt tagline:** "The app that checks who actually called it."

### A.4 Group-chat paste (8:15 AM blast)
> settling this before kickoff: tap your side, it stamps today's market price on it,
> and the loser lives with the receipt forever → [link]
> (5 seconds, no signup. send it to the guy who "called" 2022.)

### A.5 QR sign copy (pick one per sign)
1. **"38% OF THIS CROWD IS ABOUT TO BE WRONG. PUBLICLY."** → QR
2. **"GET A RECEIPT FOR THAT OPINION."** → QR
3. **"EVERYONE HERE CALLED IT. PROVE IT. 5 SECONDS, NO SIGNUP."** → QR

### A.6 TikTok hooks
1. "we brought a microphone to the biggest watch party in the Bay to collect receipts
   before Messi's last game"
2. "everyone here locked a prediction before kickoff. it's now [2–0]. we're finding
   the [38%]."
3. "POV: your World Cup final prediction died, so the Receipts Department stamped its
   death certificate"
4. "we built an app in 48 hours so 'I called it' guys can finally be stopped. today:
   its first World Cup final."
5. "3,000 phones finding out at the exact same second who actually called it"

---

*Sources for event facts: kickoff/venue via FOX Sports; matchup, odds lean, and
Messi/Yamal storylines via ESPN/SI/Al Jazeera coverage of the July 19 final; San Pedro
Square "Soccer Celebration" official watch party and 400K attendance via San Jose
Earthquakes / Visit San Jose announcements.*

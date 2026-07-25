/**
 * Does routing "The Usual" (Confit's per-user memory) through xTrace's extraction path beat
 * Confit's as-designed architecture, where the confession is stripped on-device into a
 * five-field structured lesson before anything is stored?
 *
 * 2x2, so the representation and the substrate are separable:
 *   prose   -> xTrace      (the suggestion)
 *   prose   -> pgvector    (does prose alone explain any gain?)
 *   lesson  -> xTrace      (does the store rescue the stripped form?)
 *   lesson  -> pgvector    (Confit as designed)
 *
 * The structured lessons below are written to be the BEST faithful version of Confit's schema
 * ({place, signal, driver, cadence, weight}), not a strawman — expressive enums, correct drivers.
 * If the stripped form still loses, the loss is in the representation, not in my rendering of it.
 *
 * Seven patterns are planted, none stated in any single confession. Two are deliberately hard:
 * SUPERSESSION (appetite collapses after starting a medication, with the OLD preference carrying
 * more records) and INTERACTION (orders larger and hotter when observed, and regrets both) —
 * the second cannot be represented in a per-confession schema at all, because it is a
 * relationship between confessions.
 */

/** @typedef {{month:number, text:string, lesson:object, tags:string[]}} Confession */

/** @type {Confession[]} */
export const CONFESSIONS = [
  // ---- month 1: big appetite era, katsu love, group dining ----
  { month: 1, tags: ['old-appetite'],
    text: "Ordered two mains at Ha's because one katsu is never enough. Finished both. No notes.",
    lesson: { place: 'has_counter', signal: 'high_appetite_repeat_order', driver: 'appetite', cadence: 'weekly', weight: 0.8 } },
  { month: 1, tags: ['price'],
    text: "The nine pound lunch set at Rosa's is the only correct way to eat there. Dinner is the same food for thirty-two.",
    lesson: { place: 'rosas_taqueria', signal: 'prefers_lunch_sitting', driver: 'price_band', cadence: 'repeat', weight: 0.85 } },
  { month: 1, tags: ['old-appetite'],
    text: "Katsu curry at the mall branch, large, plus a side. I could eat this every day for a year.",
    lesson: { place: 'mall_branch', signal: 'high_appetite_repeat_order', driver: 'appetite', cadence: 'weekly', weight: 0.75 } },
  { month: 1, tags: ['solo'],
    text: "Tuesday, alone, counter seat at Ha's. The bartender started my order before I sat down. Favourite two hours of my week.",
    lesson: { place: 'has_counter', signal: 'solo_weeknight_visit', driver: 'solo_comfort', cadence: 'weekly', weight: 0.9 } },
  { month: 1, tags: ['spice-social'],
    text: "Asked for it Thai hot at Rosa's because Dan was there and I have been pretending for years. Sweated through the whole meal and tasted nothing.",
    lesson: { place: 'rosas_taqueria', signal: 'regretted_high_spice', driver: 'social_performance', cadence: 'occasional', weight: 0.85 } },

  // ---- month 2 ----
  { month: 2, tags: ['ramen-satiation'],
    text: "Ramen Monday and again Thursday. Tried a third bowl on Sunday and could barely finish it. Every single time.",
    lesson: { place: 'ramen_place', signal: 'satiation_by_third_serving', driver: 'satiation', cadence: 'fortnightly', weight: 0.8 } },
  { month: 2, tags: ['portion-social'],
    text: "Got the large at Rosa's because I was with the work lot and felt strange asking for the small. Left two thirds of it.",
    lesson: { place: 'rosas_taqueria', signal: 'oversized_order_left_uneaten', driver: 'social_performance', cadence: 'occasional', weight: 0.8 } },
  { month: 2, tags: ['solo'],
    text: "Went alone on a Wednesday to the ramen place, counter again. Genuinely restorative.",
    lesson: { place: 'ramen_place', signal: 'solo_weeknight_visit', driver: 'solo_comfort', cadence: 'weekly', weight: 0.85 } },
  { month: 2, tags: ['exclusion'],
    text: "The food at Bellwether is genuinely excellent. We broke up there. I am never going back.",
    lesson: { place: 'bellwether', signal: 'permanent_exclusion', driver: 'personal_association', cadence: 'never', weight: 0.95 } },
  { month: 2, tags: ['price'],
    text: "Went to Ha's for dinner with the group. Sixty quid. The food was identical to the lunch set.",
    lesson: { place: 'has_counter', signal: 'prefers_lunch_sitting', driver: 'price_band', cadence: 'repeat', weight: 0.8 } },

  // ---- month 3 ----
  { month: 3, tags: ['old-appetite'],
    text: "Double katsu again at Ha's. This is just what I order. Twice a week if I can.",
    lesson: { place: 'has_counter', signal: 'high_appetite_repeat_order', driver: 'appetite', cadence: 'weekly', weight: 0.85 } },
  { month: 3, tags: ['spice-social'],
    text: "Told them extra chili in front of the others. Why do I keep doing this. Ruined a good bowl and pretended it was great.",
    lesson: { place: 'ramen_place', signal: 'regretted_high_spice', driver: 'social_performance', cadence: 'occasional', weight: 0.85 } },
  { month: 3, tags: ['spice-alone'],
    text: "Ordered it mild for once, on my own, nobody watching. Best version of that dish I have ever had.",
    lesson: { place: 'ramen_place', signal: 'enjoyed_mild_when_alone', driver: 'true_preference', cadence: 'occasional', weight: 0.9 } },
  { month: 3, tags: ['solo'],
    text: "Tried going alone on a Saturday night and hated it — loud, felt observed the whole time. Weeknights only from now on.",
    lesson: { place: 'has_counter', signal: 'solo_weekend_discomfort', driver: 'solo_comfort', cadence: 'never', weight: 0.8 } },
  { month: 3, tags: ['exclusion'],
    text: "Someone suggested Bellwether for a birthday. Said I was busy that week. Will keep saying that.",
    lesson: { place: 'bellwether', signal: 'permanent_exclusion', driver: 'personal_association', cadence: 'never', weight: 0.9 } },
  { month: 3, tags: ['price'],
    text: "Lunch set at the mall branch, nine pounds, perfect. I will never willingly pay dinner prices for this food.",
    lesson: { place: 'mall_branch', signal: 'prefers_lunch_sitting', driver: 'price_band', cadence: 'repeat', weight: 0.85 } },

  // ---- month 4: the turn ----
  { month: 4, tags: ['glp1-turn'],
    text: "Started the medication three weeks ago. Everything tastes like cardboard now, which is a strange kind of grief.",
    lesson: { place: 'none', signal: 'appetite_collapse_onset', driver: 'medication', cadence: 'ongoing', weight: 0.9 } },
  { month: 4, tags: ['glp1'],
    text: "Ordered the double katsu out of habit and could not get through a third of it. Six months ago I would have had two.",
    lesson: { place: 'has_counter', signal: 'portion_now_too_large', driver: 'medication', cadence: 'ongoing', weight: 0.85 } },
  { month: 4, tags: ['glp1-soup'],
    text: "Nothing appeals since starting it, except the tom yum at Ha's. That one still lands properly.",
    lesson: { place: 'has_counter', signal: 'narrow_tolerated_dish', driver: 'medication', cadence: 'weekly', weight: 0.9 } },
  { month: 4, tags: ['portion'],
    text: "Asked for the lunch size even though I was hungry. The regular portion defeats me now.",
    lesson: { place: 'rosas_taqueria', signal: 'ordered_small_portion', driver: 'portion_size', cadence: 'repeat', weight: 0.85 } },

  // ---- month 5 ----
  { month: 5, tags: ['portion'],
    text: "Got the children's katsu at the mall branch. Zero shame about it. The adult portion goes in the bin half the time.",
    lesson: { place: 'mall_branch', signal: 'ordered_small_portion', driver: 'portion_size', cadence: 'repeat', weight: 0.9 } },
  { month: 5, tags: ['glp1-soup'],
    text: "Tom yum again at Ha's. Third week running. It is the only thing I actively want.",
    lesson: { place: 'has_counter', signal: 'narrow_tolerated_dish', driver: 'medication', cadence: 'weekly', weight: 0.95 } },
  { month: 5, tags: ['solo'],
    text: "Tuesday, alone, counter, tom yum. This is the whole routine now and I am fine with it.",
    lesson: { place: 'has_counter', signal: 'solo_weeknight_visit', driver: 'solo_comfort', cadence: 'weekly', weight: 0.9 } },
  { month: 5, tags: ['portion-social'],
    text: "With the work lot again, ordered a full main to avoid the conversation, ate a quarter, apologised to the waiter.",
    lesson: { place: 'rosas_taqueria', signal: 'oversized_order_left_uneaten', driver: 'social_performance', cadence: 'occasional', weight: 0.85 } },
  { month: 5, tags: ['ramen-satiation'],
    text: "Two weeks off ramen and I am actively craving it again. Reliable as clockwork.",
    lesson: { place: 'ramen_place', signal: 'appetite_recovered_after_fortnight', driver: 'satiation', cadence: 'fortnightly', weight: 0.8 } },

  // ---- month 6 ----
  { month: 6, tags: ['glp1'],
    text: "Tried the katsu one more time to see if it had come back. It has not. That era is over.",
    lesson: { place: 'has_counter', signal: 'former_favourite_now_rejected', driver: 'medication', cadence: 'never', weight: 0.9 } },
  { month: 6, tags: ['portion'],
    text: "Lunch size again, alone, and finished all of it for once. Small portions are just correct for me now.",
    lesson: { place: 'rosas_taqueria', signal: 'ordered_small_portion', driver: 'portion_size', cadence: 'repeat', weight: 0.9 } },
  { month: 6, tags: ['spice-alone'],
    text: "Mild, alone, no audience. Tasted everything. I should have been ordering like this for a decade.",
    lesson: { place: 'ramen_place', signal: 'enjoyed_mild_when_alone', driver: 'true_preference', cadence: 'repeat', weight: 0.9 } },
  { month: 6, tags: ['glp1-soup'],
    text: "Still the tom yum. Still Tuesdays. Still the counter.",
    lesson: { place: 'has_counter', signal: 'narrow_tolerated_dish', driver: 'medication', cadence: 'weekly', weight: 0.95 } },
  { month: 6, tags: ['exclusion'],
    text: "Walked past Bellwether and felt it in my chest. Excellent kitchen. Never again.",
    lesson: { place: 'bellwether', signal: 'permanent_exclusion', driver: 'personal_association', cadence: 'never', weight: 0.95 } },
];

export function byMonth() {
  const m = new Map();
  for (const c of CONFESSIONS) {
    if (!m.has(c.month)) m.set(c.month, []);
    m.get(c.month).push(c);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
}

/** Confit pools the lesson as a compact record. This is what a retrieval lane sees. */
export const lessonText = (c) =>
  Object.entries(c.lesson).map(([k, v]) => `${k}: ${v}`).join(', ');

/**
 * Probes mirror what "The Usual" claims to answer. `expect` is the induced truth; markers accept
 * paraphrase, because a system that normalises "the regular portion defeats me" into "prefers
 * small portions" is doing the right thing and must not be scored down for it.
 */
export const PROBES = [
  { id: 'portion', query: 'how much food does this person actually want — what portion size?',
    expect: 'small / lunch-size / children\'s portions; regular portions defeat them',
    re: /small(er)? portion|lunch size|lunch set|children'?s|kids'? |half portion|portion.*(too large|defeats)|too large|smaller/i },
  { id: 'solo', query: 'do they prefer eating alone or with other people, and when?',
    expect: 'alone on weeknights at the counter; disliked a solo weekend attempt',
    re: /alone|solo|counter|weeknight|tuesday|wednesday/i },
  { id: 'spice', query: 'how spicy do they genuinely want their food?',
    expect: 'genuinely mild — the hot orders are performed for company and regretted',
    re: /mild|regret|pretend|perform|not.*spicy|less spic|tasted everything|ruined/i },
  { id: 'price', query: 'what is their price band and which sitting do they book?',
    expect: 'lunch sittings only; refuses dinner pricing for the same food',
    re: /lunch|nine (pound|dollar)|price|dinner.*(same|identical|thirty|sixty)|cheaper/i },
  { id: 'rotation', query: 'should we suggest ramen tonight?',
    expect: 'depends on interval — sours by the third serving in a fortnight, recovers after two weeks',
    re: /third|satiation|fortnight|two weeks|craving again|barely finish|recover/i },
  { id: 'exclusion', query: 'are there places to never suggest, even good ones?',
    expect: 'Bellwether — excellent kitchen, permanent exclusion for personal reasons',
    re: /bellwether|never (going |return|again)|permanent|exclusion|avoid/i },
  // --- the two hard ones ---
  { id: 'change', query: 'has their appetite or taste changed recently, and why?',
    expect: 'yes — appetite collapsed after starting a medication; katsu era over; only tom yum still appeals',
    re: /medication|changed|no longer|used to|since|collapse|era is over|tastes? like cardboard|only.*tom yum|still lands|former favourite/i },
  { id: 'interaction', query: 'does being with other people change what they order?',
    expect: 'yes — orders larger and spicier when observed, and regrets both; true preference shows when alone',
    re: /(social|company|others|observed|audience|with people).*(larger|bigger|spic|hot|regret|perform)|(larger|spic|hot|oversized).*(social|company|others|observed|audience)|social_performance|felt strange asking|to avoid the conversation|pretending/i },
];

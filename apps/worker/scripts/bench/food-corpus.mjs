/**
 * Shared corpus for the supersession test: does a memory layer report a user's CURRENT
 * preference, or the superseded one that has more history behind it?
 *
 * Three deliberate reversals, each weighted so the OLD preference has MORE records than the new
 * one — that is the trap. A similarity search over order history retrieves the strongest signal,
 * and the strongest signal is usually the stale one.
 *
 *   dairy  : heavy Jan-Apr (11 records) -> avoiding May-Aug (7)      current = avoids dairy
 *   spice  : mild Jan-Mar (7)           -> very spicy Jun-Aug (6)    current = wants it hot
 *   venue  : Nonna's Jan-May (9)        -> Saffron House Jun-Aug (5) current = Saffron House
 *
 * Plus one STABLE aversion (olives) as a control: a correct system reports it either way, so it
 * separates "cannot find preferences at all" from "cannot tell which is current".
 *
 * Register is deliberately informal. Pre-cleaning scored WORST in the betting corpus (2/10) and
 * the informal phrasing is what makes the preference inferable at all.
 */

/** @typedef {{ month: number, text: string, tags: string[] }} Order */

/** @type {Order[]} */
export const ORDERS = [
  // --- January: dairy-heavy, mild, Nonna's ---
  { month: 1, text: "Ordered the four-cheese baked rigatoni from Nonna's again. Asked for extra mozzarella on top. Third week running, no notes, perfect.", tags: ['dairy-yes', 'venue-nonna'] },
  { month: 1, text: "Nonna's cream carbonara, extra parmesan. Told them mild on the pepper, I'm not a hero.", tags: ['dairy-yes', 'spice-mild', 'venue-nonna'] },
  { month: 1, text: "Late night order: mac and cheese, side of garlic bread with the cheese butter. Ate the entire thing standing up.", tags: ['dairy-yes'] },
  { month: 1, text: "Big oat-free latte and a butter croissant on the way to work. Standard.", tags: ['dairy-yes'] },
  { month: 1, text: "Greek salad from the place on 8th but asked for no olives, they put olives in anyway. Picked out every single one.", tags: ['olives-no'] },

  // --- February: dairy-heavy, mild, Nonna's ---
  { month: 2, text: "Nonna's again. The gorgonzola gnocchi. I don't want to talk about how often I order this.", tags: ['dairy-yes', 'venue-nonna'] },
  { month: 2, text: "Thai green curry, asked for it MILD. They asked if I was sure. I was sure.", tags: ['spice-mild'] },
  { month: 2, text: "Cheese pizza, extra cheese, ranch on the side. No notes, no regrets.", tags: ['dairy-yes'] },
  { month: 2, text: "Pad thai, no chili at all please. Also no olives obviously but they don't put olives in pad thai, I just have trust issues now.", tags: ['spice-mild', 'olives-no'] },
  { month: 2, text: "Nonna's lasagne, the one with the bechamel. Genuinely the best thing on their menu.", tags: ['dairy-yes', 'venue-nonna'] },

  // --- March: the dairy turn begins ---
  { month: 3, text: "Nonna's carbonara but something's off with me lately, felt rough for hours after. Might be a coincidence.", tags: ['dairy-yes', 'venue-nonna'] },
  { month: 3, text: "Another cheese-heavy night and another rough morning. Starting to see a pattern I don't love.", tags: ['dairy-yes'] },
  { month: 3, text: "Ordered the mild massaman, played it safe on spice again.", tags: ['spice-mild'] },
  { month: 3, text: "Right, experiment: skipped the cheese on the pizza tonight. Felt completely fine. Suspicious.", tags: ['dairy-turn'] },
  { month: 3, text: "Nonna's but got the tomato-based arrabbiata instead of anything creamy. Mild version. Still good, felt fine after.", tags: ['dairy-turn', 'spice-mild', 'venue-nonna'] },

  // --- April: dairy out, spice creeping up ---
  { month: 4, text: "Officially off dairy. Oat milk in the coffee from now on, and it's honestly fine, I was being dramatic.", tags: ['dairy-no'] },
  { month: 4, text: "Vegan pad kee mao, no fish sauce no dairy, and asked for medium heat. Medium was nothing. Noted.", tags: ['dairy-no', 'spice-turn'] },
  { month: 4, text: "Nonna's, asked what they had without cream or cheese. Ended up with the puttanesca — good, except the olives. Always the olives.", tags: ['dairy-no', 'olives-no', 'venue-nonna'] },
  { month: 4, text: "Dairy-free week four. Do not miss it. Skin's better, mornings are better.", tags: ['dairy-no'] },
  { month: 4, text: "Asked for extra chili on the noodles tonight. First time doing that. Liked it a lot.", tags: ['spice-turn'] },

  // --- May: Nonna's goes wrong, dairy stays out ---
  { month: 5, text: "Nonna's messed up the order twice in one week and the second time argued about it. Not thrilled.", tags: ['venue-nonna-bad'] },
  { month: 5, text: "Third Nonna's problem in a row — cold food, forty minutes late, no apology. I think I'm done with them.", tags: ['venue-nonna-bad'] },
  { month: 5, text: "Dairy-free still going strong. Coconut yoghurt is a genuinely good substitute.", tags: ['dairy-no'] },
  { month: 5, text: "Tried Saffron House for the first time since Nonna's is off the list. The lamb was excellent and they knew what dairy-free meant without me explaining.", tags: ['venue-saffron', 'dairy-no'] },
  { month: 5, text: "Chili oil on everything lately. Put it on rice. Put it on eggs.", tags: ['spice-turn'] },

  // --- June: new normal ---
  { month: 6, text: "Saffron House again. Asked for it properly hot this time and they delivered. Eyes watering, extremely happy.", tags: ['venue-saffron', 'spice-hot'] },
  { month: 6, text: "Saffron House, the dairy-free thali, extra chili on the side. This is the new routine.", tags: ['venue-saffron', 'dairy-no', 'spice-hot'] },
  { month: 6, text: "Thai place, asked for Thai hot rather than farang hot. Correct decision.", tags: ['spice-hot'] },
  { month: 6, text: "Antipasti platter at a work thing, quietly relocated all the olives to a napkin like a child.", tags: ['olives-no'] },
  { month: 6, text: "Oat flat white, no pastry. The dairy thing is just how I eat now, not a phase.", tags: ['dairy-no'] },

  // --- July ---
  { month: 7, text: "Saffron House, extra green chili, no dairy. They have my order memorised at this point.", tags: ['venue-saffron', 'spice-hot', 'dairy-no'] },
  { month: 7, text: "Ordered the ghost pepper wings as a test. Finished them. A year ago this would have ended me.", tags: ['spice-hot'] },
  { month: 7, text: "Got a Greek wrap, asked for no olives THREE times, still olives. Genuinely impressive failure.", tags: ['olives-no'] },
  { month: 7, text: "Saffron House delivery, the hot one, dairy-free as always.", tags: ['venue-saffron', 'spice-hot', 'dairy-no'] },

  // --- August ---
  { month: 8, text: "Someone suggested Nonna's for a group thing. Suggested literally anywhere else.", tags: ['venue-nonna-bad'] },
  { month: 8, text: "Saffron House twice this week. Hot, dairy-free, no notes.", tags: ['venue-saffron', 'spice-hot', 'dairy-no'] },
  { month: 8, text: "Made curry at home, put in twice the chili the recipe said. Recipe was a coward.", tags: ['spice-hot'] },
  { month: 8, text: "Coconut milk ice cream is genuinely better than the dairy version and I will die on this hill.", tags: ['dairy-no'] },
  { month: 8, text: "Ordered a salad, specified no olives, and for once in my life there were no olives. Framing the receipt.", tags: ['olives-no'] },
];

/** Group into per-month conversations. Batch-level ingest/embedding beat finer granularity in
 * both prior corpora, and isolated single messages get little or no extraction. */
export function byMonth() {
  const m = new Map();
  for (const o of ORDERS) {
    if (!m.has(o.month)) m.set(o.month, []);
    m.get(o.month).push(o);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
}

const MONTH_NAME = { 1: 'January', 2: 'February', 3: 'March', 4: 'April', 5: 'May', 6: 'June', 7: 'July', 8: 'August' };
export const monthName = (n) => MONTH_NAME[n];

/**
 * The four probes. `current` is the truth as of August; `superseded` is the trap — the answer a
 * system gives when it retrieves the higher-volume stale signal instead.
 */
export const PROBES = [
  {
    id: 'dairy',
    query: 'does this person eat dairy? cheese, cream, milk',
    current: 'avoids dairy — stopped around March/April, oat milk, dairy-free, permanent',
    superseded: 'loves dairy — extra cheese, cream sauces, four-cheese pasta',
    currentRe: /dairy[- ]free|off dairy|oat milk|no cheese|avoid(s|ing)? dairy|without cream|stopped .*dairy|coconut (yoghurt|milk)|not a phase|no dairy/i,
    // Must describe ENJOYING dairy. The March records mention cheese while reporting it made them
    // ill, which is change-supporting, not stale-supporting — hence the exclusions.
    supersededRe: /extra (mozzarella|parmesan|cheese)|four-cheese|cream carbonara|mac and cheese|gorgonzola|bechamel|butter croissant|cheese pizza, extra cheese/i,
    supersededExcludeRe: /felt rough|something's off|rough morning|pattern i don't love|skipped the cheese/i,
  },
  {
    id: 'spice',
    query: 'how spicy does this person like their food?',
    current: 'wants it very hot — extra chili, Thai hot, ghost pepper',
    superseded: 'wants it mild — asks for mild, no chili',
    // "medium heat was too mild" / "medium was nothing" argue for MORE heat: current-supporting.
    currentRe: /extra (green )?chili|thai hot|ghost pepper|properly hot|twice the chili|chili oil|the hot one|hot, dairy-free|too mild|medium was nothing|escalating spice|hotter|more heat|spicier/i,
    supersededRe: /asked for it mild|asked for.*\bMILD\b|mild on the pepper|no chili at all|not a hero|played it safe on spice|the mild (massaman|version)|mild version|prefers mild|likes mild/i,
    supersededExcludeRe: /too mild|was nothing/i,
  },
  {
    id: 'venue',
    query: 'where does this person order from these days?',
    current: 'Saffron House — switched after Nonna\'s went wrong in May',
    superseded: "Nonna's — their old regular",
    currentRe: /saffron house/i,
    // Nonna's as a CURRENT favourite. Complaints about Nonna's explain the switch, so they are
    // change-supporting rather than stale-supporting.
    supersededRe: /nonna'?s/i,
    supersededExcludeRe: /messed up|argued|not thrilled|cold food|forty minutes late|no apology|done with them|anywhere else|nonna'?s is off|with nonna'?s out|problem in a row/i,
  },
  {
    id: 'olives',
    query: 'how does this person feel about olives?',
    current: 'dislikes olives — consistently asks for none (STABLE, control)',
    superseded: null,
    // Accepts paraphrase: a system that normalises "picked out every single one" into "avoids
    // olives" is doing the right thing and must not be scored down for it.
    currentRe: /no olives|picked out every|olives.*napkin|except the olives|always the olives|still olives|avoids? olives|dislike[sd]? (the )?olives|wary of olives|relocated .*olives|olives.*(dislike|avoid)/i,
    supersededRe: null,
  },
];

/**
 * Pure prompt builders (docs/xtrace-hackathon-tasks.md XH-T3) — one per generation kind, each
 * taking a typed context object and returning `{ system, user }`. No I/O, no truncation:
 * `generate.ts` truncates `memory` (COMPANION_SEARCH_LIMIT items, 500 chars each) before
 * calling these.
 */

/**
 * Shared preamble, worded once and reused verbatim across all three kinds (pinned by the
 * snapshot test below — a change here is a deliberate prompt-drift decision, not an accident).
 */
const SHARED_PREAMBLE = [
  'Facts in the RECORD block are authoritative and complete. Never state a score, record, ' +
    'streak or result that is not in RECORD. MEMORY items are color: callbacks, tone, ' +
    'grudges. If MEMORY contradicts RECORD, RECORD wins.',
  'Never mention money, betting, stakes, wagers, dollar amounts, or odds as prices.',
  // Voice: the fighting-game callout register — maximum confidence, theatrical contempt,
  // rhythmic escalation, and the signature "go away and never come back" dismissal.
  'VOICE — loud, theatrical, supremely confident trash talk. Short declarative hammer blows, ' +
    'not paragraphs. Build: each line hits harder than the last. Absolute certainty, zero ' +
    'hedging, no "maybe" or "seems like". Contempt is the register, but it is EARNED contempt: ' +
    'every shot lands on something specific from RECORD or MEMORY, never a generic insult.',
  'The signature move is the dismissal — tell them to quit, uninstall, delete the app, take up ' +
    'a different hobby, stay off the leaderboard. Use it as a closer, and only when the record ' +
    'actually justifies it. If the record is close or they are winning, the swagger has to be ' +
    'earned differently or dropped entirely; talking trash from behind is how you look stupid.',
  'Do not just recite RECORD numbers back. Numbers are ammunition, not the line. When MEMORY ' +
    'has a specific callback, grudge, or humiliating detail, that is the flavor — lead with it.',
  // These lines are delivered to real people inside the product (banter about a named opponent,
  // callout drafts sent directly to them), so the target of the mockery is bounded on purpose.
  'HARD LIMITS. Mock the picks, the record, the streak, the choices — never the human. No ' +
    'slurs or obscenity. Nothing about anyone\'s body, looks, family, intelligence, race, ' +
    'gender, sexuality, religion, or mental health. Never reference self-harm, violence, or ' +
    'telling someone to hurt themselves. Never impersonate or name a real public figure. ' +
    'Ruthless about the games; clean about the person.',
  'No emoji. No hashtags.',
].join('\n');

export interface PromptPair {
  system: string;
  user: string;
}

export interface BanterContext {
  viewerHandle: string;
  opponentHandle: string;
  record: { wins: number; losses: number; draws: number };
  currentWeek: { scoreViewer: number; scoreOpponent: number; daysRemaining: number } | null;
  lastVerdictLine: string | null;
  memory: string[];
}

export interface CalloutDraftContext {
  challengerHandle: string;
  targetHandle: string;
  record: { wins: number; losses: number; draws: number };
  memory: string[];
}

export interface RecapContext {
  handle: string;
  seasonName: string;
  stats: {
    pairings: number;
    wins: number;
    losses: number;
    draws: number;
    bestStreak: number;
    calloutsSent: number;
    calloutsWon: number;
  };
  verdictLines: string[];
  memory: string[];
}

function formatMemory(memory: string[]): string {
  return memory.length > 0 ? memory.map((line) => `- ${line}`).join('\n') : '(none)';
}

export function buildBanterPrompt(ctx: BanterContext): PromptPair {
  const record =
    `RECORD: ${ctx.viewerHandle} vs ${ctx.opponentHandle} — ` +
    `${ctx.record.wins}-${ctx.record.losses}-${ctx.record.draws} lifetime.`;
  const week = ctx.currentWeek
    ? `Current week: ${ctx.viewerHandle} ${ctx.currentWeek.scoreViewer} — ` +
      `${ctx.currentWeek.scoreOpponent} ${ctx.opponentHandle}, ` +
      `${ctx.currentWeek.daysRemaining} day(s) remaining.`
    : 'No active week in progress.';
  const verdict = ctx.lastVerdictLine
    ? `Last verdict: ${ctx.lastVerdictLine}`
    : 'No prior verdict on record.';
  const user = [
    record,
    week,
    verdict,
    `MEMORY:\n${formatMemory(ctx.memory)}`,
    'Write 1-3 short banter lines for the viewer to read about this rivalry.',
  ].join('\n\n');
  return { system: SHARED_PREAMBLE, user };
}

export function buildCalloutDraftPrompt(ctx: CalloutDraftContext): PromptPair {
  const record =
    `RECORD: ${ctx.challengerHandle} vs ${ctx.targetHandle} — ` +
    `${ctx.record.wins}-${ctx.record.losses}-${ctx.record.draws} lifetime.`;
  const user = [
    record,
    `MEMORY:\n${formatMemory(ctx.memory)}`,
    `Write a few short callout-message drafts ${ctx.challengerHandle} could send to challenge ` +
      `${ctx.targetHandle} to a rematch.`,
  ].join('\n\n');
  return { system: SHARED_PREAMBLE, user };
}

export function buildRecapPrompt(ctx: RecapContext): PromptPair {
  const record =
    `RECORD: ${ctx.handle}, ${ctx.seasonName} — ${ctx.stats.pairings} pairing(s), ` +
    `${ctx.stats.wins}-${ctx.stats.losses}-${ctx.stats.draws}, best streak ${ctx.stats.bestStreak}, ` +
    `${ctx.stats.calloutsSent} callout(s) sent (${ctx.stats.calloutsWon} won).`;
  const verdicts =
    ctx.verdictLines.length > 0
      ? `VERDICTS (in order):\n${ctx.verdictLines.map((line) => `- ${line}`).join('\n')}`
      : 'VERDICTS: (none)';
  const user = [
    record,
    verdicts,
    `MEMORY:\n${formatMemory(ctx.memory)}`,
    `Write a short season recap for ${ctx.handle} covering ${ctx.seasonName}: a title and 1-4 ` +
      'paragraphs.',
  ].join('\n\n');
  return { system: SHARED_PREAMBLE, user };
}

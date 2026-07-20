/**
 * `/nemesis` page-state selection (design-diff audit: the mockup's three distinct nemesis-week
 * moments — Monday's assignment reveal, the daily reveal card's "second life" (already shipped
 * inline on `/q/[slug]`, PR #99), and Friday's verdict — used to all render STACKED on one page
 * (a compact `NemesisAssignmentCard`, then the full `NemesisMatchupCard` inlined, then
 * `NemesisHistoryList`). This decides which ONE of the remaining two is primary content, per this
 * codebase's convention of extracting this kind of branching into `lib/nemesis/` helpers rather
 * than inlining the conditionals in the page component (see `deriveDayResults`/`sideOutcome` in
 * `./verdict.ts`).
 */
import type { NemesisHistoryEntry, PairingPublic } from './types';

export type NemesisPageState =
  | { kind: 'empty' }
  | { kind: 'assignment' }
  | { kind: 'verdict'; entry: NemesisHistoryEntry };

/**
 * - `assignment`: `getCurrentPairingForProfile` returned a pairing — there's an active week.
 * - `verdict`: no active pairing right now — the week just concluded and Monday's reassignment
 *   hasn't landed yet. This window is real, not a proxy for anything else:
 *   `getCurrentPairingForProfile` only ever returns a `status='active'` row (`lib/nemesis/
 *   service.ts`), so it naturally goes back to `null` between Friday's conclusion and Monday's
 *   `nemesis:assign` batch. AND the most recent history entry (`historyEntries[0]` — callers pass
 *   `getNemesisHistoryPage`'s `data`, already sorted newest-first by
 *   `listNemesisHistoryForProfile`'s `ORDER BY week_start DESC, id DESC`) has a real outcome:
 *   `outcome !== 'cancelled'`, matching `verdictOutcomeFromHistory`'s own cancelled → no-verdict-
 *   card convention (a cancelled week never gets a `VerdictCard`, by design).
 * - `empty`: neither of the above — no active pairing, and either no history yet or the most
 *   recent entry was cancelled.
 */
export function selectNemesisPageState(input: {
  pairing: PairingPublic | null;
  historyEntries: readonly NemesisHistoryEntry[];
}): NemesisPageState {
  if (input.pairing) return { kind: 'assignment' };
  const mostRecent = input.historyEntries[0];
  if (mostRecent && mostRecent.outcome !== 'cancelled') {
    return { kind: 'verdict', entry: mostRecent };
  }
  return { kind: 'empty' };
}

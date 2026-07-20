import type { VerdictOutcome } from './VerdictCard';

export interface NemesisHeadToHeadBannerProps {
  viewerHandle: string;
  opponentHandle: string;
  viewerScore: number;
  opponentScore: number;
  /** Same authoritative outcome `VerdictCard` renders for this entry — used only to color the
   * bar (never re-derived from the raw scores here), because a tiebreak week can have
   * `viewerScore === opponentScore` and still carry a real `won`/`lost` outcome (§SW10-T2's
   * "closed it out on the tiebreak" case, `copy.ts`'s `verdictWinnerLine`/`verdictLoserLine`
   * margin-0 branch) — recomputing from the scores alone would render that week as a false
   * dead-even split. */
  outcome: VerdictOutcome;
  className?: string;
}

/** Bar-segment color per side, keyed off the authoritative outcome — never a static "you're
 * always green" mapping. `win`/`loss` (not `sideA`/`sideB`) on purpose: this bar isn't a
 * yes/no market side, it's "you" vs. "them" for a single settled week, the same relationship
 * `VerdictCard`'s own `Stamp variant={outcome}` already colors with `win`/`loss` one row below —
 * reusing that pairing keeps one color meaning ("green = the side that won this week") instead
 * of introducing a second, unrelated blue/orange vocabulary next to it. */
function segmentColors(outcome: VerdictOutcome): { viewer: string; opponent: string } {
  if (outcome === 'won') return { viewer: 'bg-win', opponent: 'bg-loss' };
  if (outcome === 'lost') return { viewer: 'bg-loss', opponent: 'bg-win' };
  return { viewer: 'bg-muted', opponent: 'bg-muted' };
}

/**
 * Head-to-head summary banner for a settled nemesis week (design-diff audit: the mockup's
 * Friday verdict exhibit, `docs/mockups/swipe-ux.html` "WEEK 30 · VERDICT", pairs its verdict
 * card with a handle-vs-handle scoreline and a proportional score bar above it — the shipped
 * `VerdictCard` had neither). Deliberately thin: `VerdictCard` already owns the day-by-day dot
 * strip (its `dayResults` prop) and the winner/loser narrative line, so this only adds what
 * was actually missing — both players' handles and scores, and the bar. No "N right"/edge
 * copy: `nemesisHistoryEntrySchema` carries only `my_score`/`their_score`, so, matching
 * `VerdictCard`'s own pinned constraint (`copy.ts`'s `verdictWinnerLine`/`verdictLoserLine`),
 * this asserts score-margin facts only.
 *
 * Pure/presentational — mounted directly above the row's `VerdictCard` in `NemesisHistoryList`,
 * for every entry that gets one (i.e. not `cancelled`, per that file's `verdictFor()` convention).
 */
export function NemesisHeadToHeadBanner({
  viewerHandle,
  opponentHandle,
  viewerScore,
  opponentScore,
  outcome,
  className = '',
}: NemesisHeadToHeadBannerProps) {
  const total = viewerScore + opponentScore;
  // A week with zero combined score (every row voided) has nothing to proportion — split the
  // bar evenly rather than divide by zero.
  const viewerPct = total > 0 ? (viewerScore / total) * 100 : 50;
  const opponentPct = 100 - viewerPct;
  const colors = segmentColors(outcome);

  return (
    <div data-testid="head-to-head-banner" className={`space-y-1.5 ${className}`}>
      <div className="flex items-baseline justify-between gap-2 font-mono text-xs">
        <span className="flex min-w-0 items-baseline gap-1 font-semibold">
          <span className="min-w-0 truncate">{viewerHandle}</span>
          <span className="text-muted shrink-0 font-normal">{viewerScore}</span>
        </span>
        <span className="flex min-w-0 items-baseline gap-1 font-semibold">
          <span className="text-muted shrink-0 font-normal">{opponentScore}</span>
          <span className="min-w-0 truncate">{opponentHandle}</span>
        </span>
      </div>
      <div
        role="img"
        aria-label={`Score split: ${viewerHandle} ${viewerScore}, ${opponentHandle} ${opponentScore}`}
        className="bg-surface flex h-1.5 w-full overflow-hidden rounded-full"
      >
        <span className={colors.viewer} style={{ width: `${viewerPct}%` }} />
        <span className={colors.opponent} style={{ width: `${opponentPct}%` }} />
      </div>
    </div>
  );
}

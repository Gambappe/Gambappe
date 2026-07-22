import type { ReactNode } from 'react';
import type { QuestionPublic } from '@receipts/core';
import { UnderCard } from '@receipts/ui';

export interface DeckStageProps {
  question: QuestionPublic;
  /** The hydrating viewer island (`ViewerStrip` → `SwipeBallot`), placed in the card position. */
  viewerSlot: ReactNode;
  /**
   * Flat fallback label for the peek card under the deck (tomorrow's appointment) — always the
   * static `copy.question.tomorrowTeaser` banner (viewer-free, INV-10). Design-diff audit: once
   * a pick is committed, `SwipeBallot`'s own `pick` branch (client-side, post-hydration) renders
   * a SECOND, real-data `UnderCard` directly behind its printed `ReceiptSlip` when
   * `GET /questions/tomorrow` confirms one exists — see that file's `tomorrowPeek` prop. That one
   * paints in front of (visually replaces) this static one at the same position when it renders;
   * this prop/element deliberately stays untouched so every OTHER open-state render (pre-pick,
   * or the flag-off ticket path entirely) is unaffected and every existing snapshot for those
   * states holds.
   */
  underLabel?: string;
}

/**
 * SW2-T1 · The full-screen deck stage (swipe-ux-plan §2.5): a dark stage that fills the viewport
 * with the ballot in the middle. Viewer-free and server-rendered (INV-10) — it renders only the
 * static chrome and slots the client viewer island into the card position, so its HTML is
 * identical for every visitor. The interactive ballot, tint, stamp preview, the single yes/no/skip
 * instruction line and receipt all live in `SwipeBallot` (which `ViewerStrip` hydrates into the
 * slot); the stage supplies the frame.
 *
 * The old side rails (a persistent per-edge "← No"/"Yes →" tutorial TEXT) were removed as redundant
 * clutter — the swipe direction is taught once by SwipeBallot's single instruction line. The faint
 * orange-left / blue-right ambient EDGE GLOW is kept (text-free): it's the D-SW9 axis colour cue
 * that gives the dark stage some life without re-adding signage. `question` is retained on the
 * props for API stability (callers still pass it).
 */
export function DeckStage({ viewerSlot, underLabel }: DeckStageProps) {
  return (
    <div
      data-testid="deck-stage"
      dir="ltr"
      className="bg-bg relative flex min-h-[70dvh] flex-col overflow-hidden rounded-xl"
    >
      {/* Ambient axis glow (§2.5) — text-free, decorative, non-interactive. Against = orange on the
          left, for = blue on the right (D-SW9), matching the wells' swipe tint. */}
      <div
        aria-hidden="true"
        data-testid="stage-glow-against"
        className="pointer-events-none absolute inset-y-0 left-0 w-12"
        style={{ background: 'linear-gradient(90deg, rgba(249,115,22,0.12), transparent)' }}
      />
      <div
        aria-hidden="true"
        data-testid="stage-glow-for"
        className="pointer-events-none absolute inset-y-0 right-0 w-12"
        style={{ background: 'linear-gradient(-90deg, rgba(59,130,246,0.12), transparent)' }}
      />

      {/* The card column. The under-card peeks from behind so finishing today reveals tomorrow. */}
      <div className="relative z-10 mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-9 py-8">
        <div className="relative">
          <UnderCard
            label={underLabel}
            className="absolute inset-x-3 -top-3 -z-10 scale-95 opacity-80"
          />
          {viewerSlot}
        </div>
      </div>
    </div>
  );
}

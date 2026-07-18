/**
 * `QuestionRow` (+ its `MarketRow`) → the public `questionPublicSchema` shape (§9.2, §9.3, §5.7
 * effective-state rule). Two things read-side derivation has to get right:
 *
 *  1. **Effective status** is derived from timestamps, not the raw column — a question whose
 *     `lock_at` has passed presents as `locked` even if `question:lock` hasn't run yet
 *     (worker-outage tolerance, §5.7). `revealed`/`voided` are real gates, never inferred.
 *  2. **Crowd split is null while `open` (effective), with no exceptions** (§9.3) — and even
 *     once effectively locked, it's null until the real lock snapshot exists (a late lock job
 *     "back-fills" it; there's nothing dishonest about returning null in the meantime).
 */
import type { QuestionStatus } from '@receipts/core';
import type { MarketRow, QuestionRow } from '@receipts/db';
import type { QuestionPublic } from '@receipts/core';

/** §5.7 effective-state rule. `revealed`/`voided` are terminal and never overridden. */
export function effectiveQuestionStatus(question: QuestionRow, at: Date): QuestionStatus {
  if (question.status === 'revealed' || question.status === 'voided') return question.status;
  if (at.getTime() >= question.lockAt.getTime()) return 'locked';
  if (at.getTime() >= question.openAt.getTime()) return 'open';
  return question.status === 'draft' ? 'draft' : 'scheduled';
}

export function serializeQuestionPublic(question: QuestionRow, market: MarketRow, at: Date): QuestionPublic {
  if (!question.slug) throw new Error(`serializeQuestionPublic: question ${question.id} has no slug`);

  const status = effectiveQuestionStatus(question, at);
  const showCrowd = status !== 'open' && status !== 'scheduled' && status !== 'draft';
  const crowd =
    showCrowd && question.crowdYesAtLock !== null && question.crowdNoAtLock !== null
      ? {
          yes: question.crowdYesAtLock,
          no: question.crowdNoAtLock,
          pct_yes:
            question.crowdYesAtLock + question.crowdNoAtLock === 0
              ? 0
              : (question.crowdYesAtLock / (question.crowdYesAtLock + question.crowdNoAtLock)) * 100,
        }
      : null;

  return {
    id: question.id as QuestionPublic['id'],
    slug: question.slug,
    kind: question.kind,
    status,
    question_date: question.questionDate,
    headline: question.headline,
    blurb: question.blurb,
    yes_label: question.yesLabel,
    no_label: question.noLabel,
    open_at: question.openAt.toISOString(),
    lock_at: question.lockAt.toISOString(),
    reveal_at: question.revealAt.toISOString(),
    yes_price: market.yesPrice,
    yes_price_updated_at: market.yesPriceUpdatedAt ? market.yesPriceUpdatedAt.toISOString() : null,
    crowd,
    // Publication rule (§6.5/§6.7): outcome is a real gate on the RAW status, never inferred.
    outcome: question.status === 'revealed' ? question.outcome : null,
    revealed_at: question.status === 'revealed' ? question.revealedAt!.toISOString() : null,
    void_reason: question.voidReason,
    is_volatile: question.isVolatile,
    venue: market.venue,
    venue_url: market.venueUrl,
  };
}

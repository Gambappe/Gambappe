/**
 * SW2-T1 · The deck stage + its flag-gated wiring into `QuestionStateView`. Static structure via
 * `renderToStaticMarkup` (repo pattern); the INV-10 byte-identical / dual-render proof for the
 * flag-off path lives in `question-state-view.test.tsx` and stays green because `swipeBallot`
 * defaults false.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { QuestionPublic } from '@receipts/core';

import { DeckStage } from '@/components/DeckStage';
import { QuestionStateView } from '@/components/QuestionStateView';

const base: QuestionPublic = {
  id: '018f1e2b-0000-7000-8000-000000000001' as QuestionPublic['id'],
  slug: 'will-it-happen',
  kind: 'daily',
  status: 'open',
  question_date: '2026-07-19',
  headline: 'Will it happen?',
  blurb: null,
  yes_label: 'CUTS',
  no_label: 'HOLDS',
  open_at: '2026-07-19T13:00:00Z',
  lock_at: '2026-07-19T16:00:00Z',
  reveal_at: '2026-07-20T00:00:00Z',
  yes_price: 0.63,
  yes_price_updated_at: '2026-07-19T13:00:00Z',
  crowd: null,
  outcome: null,
  revealed_at: null,
  void_reason: null,
  is_volatile: false,
  venue: 'kalshi',
  venue_url: 'https://kalshi.example/markets/test',
};

describe('DeckStage', () => {
  it('renders the against rail left of the for rail (D-SW9 axis) and pins dir=ltr', () => {
    const html = renderToStaticMarkup(
      <DeckStage question={base} viewerSlot={<div data-testid="slot" />} />,
    );
    const againstIdx = html.indexOf('data-testid="rail-against"');
    const forIdx = html.indexOf('data-testid="rail-for"');
    expect(againstIdx).toBeGreaterThanOrEqual(0);
    expect(forIdx).toBeGreaterThan(againstIdx);
    expect(html).toContain('dir="ltr"');
    expect(html).toContain('data-testid="slot"');
  });

  it('labels the rails with the venue side words', () => {
    const html = renderToStaticMarkup(<DeckStage question={base} viewerSlot={null} />);
    expect(html).toContain('HOLDS');
    expect(html).toContain('CUTS');
  });
});

describe('QuestionStateView — swipe_ballot flag', () => {
  it('renders the deck stage for the open state when the flag is on', () => {
    const html = renderToStaticMarkup(
      <QuestionStateView
        question={base}
        serverOffsetMs={0}
        swipeBallot
        viewerSlot={<div data-testid="viewer" />}
      />,
    );
    expect(html).toContain('data-testid="deck-stage"');
    expect(html).toContain('data-testid="viewer"');
    // The ticket price-tag block is replaced by the deck for open.
    expect(html).not.toContain('data-testid="question-open"');
  });

  it('keeps the ticket layout for the open state when the flag is off (unchanged)', () => {
    const html = renderToStaticMarkup(
      <QuestionStateView question={base} serverOffsetMs={0} viewerSlot={null} />,
    );
    expect(html).toContain('data-testid="question-open"');
    expect(html).not.toContain('data-testid="deck-stage"');
  });

  it('does not deck-ify non-open states even with the flag on (SW2-T2 owns those)', () => {
    const html = renderToStaticMarkup(
      <QuestionStateView
        question={{ ...base, status: 'scheduled' }}
        serverOffsetMs={0}
        swipeBallot
        viewerSlot={null}
      />,
    );
    expect(html).toContain('data-testid="question-scheduled"');
    expect(html).not.toContain('data-testid="deck-stage"');
  });
});

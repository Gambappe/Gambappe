/**
 * WS22-T2 · `CrowdBoards` unit test (journeys-plan §5, D-J7). Node env → static-markup assertions
 * on the SERVER render (repo pattern, mirrors `app-shell.test.tsx` / `topic-follow-chips.test.tsx`);
 * the browser-only behaviors (chip switching, the viewer-row highlight hydrating from `/api/v1/me`)
 * are exercised in `e2e/crowd.spec.ts`. `next/link` is mocked so the table renders hermetically.
 *
 * The load-bearing test here is INV-10: the server render carries NO viewer-specific data. Because
 * the viewer is resolved only in a `useEffect` (`GET /api/v1/me`) that never runs during
 * `renderToStaticMarkup`, the static HTML must contain no highlight, no "your row" label, and no
 * per-row streak flame — and must be byte-identical across renders. That is exactly the property
 * that lets `/crowd` be ISR without a returning ghost's cookie fragmenting the cache.
 */
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MARKET_CATEGORY } from '@receipts/core';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  } & Record<string, unknown>) => createElement('a', { href, ...rest }, children),
}));

import { CrowdBoards } from '@/components/crowd/CrowdBoards';
import { crowdCopy } from '@/lib/copy';
import type { CrowdBoard } from '@/lib/leaderboard-page';

function entry(rank: number, over: Partial<{ handle: string; slug: string; wins: number; edge_sum: number; picks: number }> = {}) {
  return {
    rank,
    profile: {
      profile_id: `p${rank}`,
      handle: over.handle ?? `Player-${rank}`,
      slug: over.slug ?? `player-${rank}`,
    },
    wins: over.wins ?? 5,
    edge_sum: over.edge_sum ?? 1.25,
    picks: over.picks ?? 7,
  };
}

/** Overall has rows; one category board is empty to exercise the per-board empty state. */
function boards(): CrowdBoard[] {
  return [
    { category: 'overall', entries: [entry(1, { handle: 'Ada', slug: 'ada' }), entry(2, { handle: 'Bo', slug: 'bo' })] },
    { category: 'sports', entries: [entry(1, { handle: 'Ada', slug: 'ada' })] },
    { category: 'politics', entries: [] },
    { category: 'economics', entries: [] },
    { category: 'culture', entries: [] },
    { category: 'science', entries: [] },
    { category: 'other', entries: [] },
  ];
}

describe('CrowdBoards (INV-10)', () => {
  it('server render carries NO viewer-specific data (no highlight, no you-row, no flame)', () => {
    const html = renderToStaticMarkup(<CrowdBoards boards={boards()} weekStart="2026-07-20" live />);
    // The viewer highlight, the "your row" a11y label, and the streak flame are all client-only.
    expect(html).not.toContain('crowd-row-me');
    expect(html).not.toContain(crowdCopy.youRowLabel);
    expect(html).not.toContain('bg-surface'); // the highlighted-row background never appears in SSR
    expect(html).not.toContain('🔥'); // per-row streak flame is hydrated, never server-rendered
  });

  it('is byte-identical across renders (deterministic, cookie/viewer-free)', () => {
    const a = renderToStaticMarkup(<CrowdBoards boards={boards()} weekStart="2026-07-20" live />);
    const b = renderToStaticMarkup(<CrowdBoards boards={boards()} weekStart="2026-07-20" live />);
    expect(a).toBe(b);
  });
});

describe('CrowdBoards rendering', () => {
  it('renders a chip per board — Overall first, then every market category — no gold (D-J8)', () => {
    const html = renderToStaticMarkup(<CrowdBoards boards={boards()} weekStart="2026-07-20" live />);
    expect(html).toContain('data-testid="crowd-chip-overall"');
    for (const category of MARKET_CATEGORY) {
      expect(html).toContain(`data-testid="crowd-chip-${category}"`);
    }
    // Overall is the default-selected chip (aria-pressed true).
    expect(html).toMatch(/crowd-chip-overall"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/crowd-chip-sports"[^>]*aria-pressed="false"/);
    expect(html).not.toContain('gold');
  });

  it('renders the default (Overall) board: rank, handle → /p/[slug], ACC = wins/picks, signed EDGE', () => {
    const html = renderToStaticMarkup(
      <CrowdBoards
        boards={[{ category: 'overall', entries: [entry(1, { handle: 'Ada', slug: 'ada', wins: 6, picks: 8, edge_sum: 2.5 })] }]}
        weekStart="2026-07-20"
        live={false}
      />,
    );
    expect(html).toContain('data-testid="crowd-board"');
    expect(html).toContain('href="/p/ada"');
    expect(html).toContain('Ada');
    expect(html).toContain('6/8'); // ACC = calls right / picks
    expect(html).toContain('+2.50'); // EDGE positive → signed
  });

  it('formats a negative edge sum without a spurious plus sign', () => {
    const html = renderToStaticMarkup(
      <CrowdBoards
        boards={[{ category: 'overall', entries: [entry(1, { edge_sum: -0.4 })] }]}
        weekStart="2026-07-20"
        live={false}
      />,
    );
    expect(html).toContain('-0.40');
    expect(html).not.toContain('+-0.40');
  });

  it('renders the empty-board state when the selected board has no entries', () => {
    const html = renderToStaticMarkup(
      <CrowdBoards
        boards={[{ category: 'overall', entries: [] }]}
        weekStart="2026-07-20"
        live={false}
      />,
    );
    expect(html).toContain('data-testid="crowd-empty"');
    expect(html).toContain(crowdCopy.emptyBoard);
    expect(html).not.toContain('data-testid="crowd-board"');
  });

  it('renders the ACC/EDGE footer legend', () => {
    const html = renderToStaticMarkup(<CrowdBoards boards={boards()} weekStart="2026-07-20" live />);
    expect(html).toContain(crowdCopy.legendAcc);
    expect(html).toContain(crowdCopy.legendEdge);
  });

  it('shows the LIVE badge only for the in-progress week', () => {
    const liveHtml = renderToStaticMarkup(<CrowdBoards boards={boards()} weekStart="2026-07-20" live />);
    expect(liveHtml).toContain('data-testid="crowd-live"');
    const pastHtml = renderToStaticMarkup(
      <CrowdBoards boards={boards()} weekStart="2026-07-13" live={false} />,
    );
    expect(pastHtml).not.toContain('data-testid="crowd-live"');
  });
});

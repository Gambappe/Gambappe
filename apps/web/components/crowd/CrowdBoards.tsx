'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { StreakFlame } from '@receipts/ui';
import { categoryLabel } from '@/lib/placement-client';
import { crowdCopy } from '@/lib/copy';
import type { CrowdBoard, LeaderboardCategory } from '@/lib/leaderboard-page';

export interface CrowdBoardsProps {
  /** Every board, viewer-free, server-rendered (INV-10). */
  boards: readonly CrowdBoard[];
  weekStart: string;
  live: boolean;
}

/** The one field a viewer-free board can honestly highlight, resolved AFTER hydration. */
interface Viewer {
  slug: string;
  streak: number;
}

function chipLabel(category: LeaderboardCategory): string {
  return category === 'overall' ? crowdCopy.overallChip : categoryLabel(category);
}

/** Signed, unitless edge sum ("price beaten at entry" — never a money amount, INV-8). */
function formatEdge(edgeSum: number): string {
  const rounded = edgeSum.toFixed(2);
  return edgeSum > 0 ? `+${rounded}` : rounded;
}

/**
 * WS22-T2 · `/crowd` boards (journeys-plan §5, D-J7). Client component so BOTH interactive bits —
 * the category chip filter AND the viewer-row highlight — run in the browser, keeping the server
 * render viewer-free and ISR-cacheable (INV-10).
 *
 * INV-10 (the load-bearing detail): the parent server component passes only viewer-free board data.
 * `viewer` starts `null` and is filled by a client-side `GET /api/v1/me` in `useEffect` — which
 * never runs during SSR/`renderToStaticMarkup`. So the server HTML has NO highlight, NO "you" row,
 * and NO streak flame; it is byte-identical whether or not a ghost cookie is present. Only after
 * hydration does the current user's row light up. `test/crowd-boards.test.tsx` pins that the static
 * markup carries none of this, and `e2e/crowd.spec.ts` proves the byte-identity over real HTTP
 * (same shape as `spectator-cache-key.spec.ts`).
 */
export function CrowdBoards({ boards, weekStart, live }: CrowdBoardsProps) {
  const [selected, setSelected] = useState<LeaderboardCategory>('overall');
  const [viewer, setViewer] = useState<Viewer | null>(null);

  useEffect(() => {
    let active = true;
    // Viewer identity is resolved client-side only (INV-10). A signed-out anonymous visitor gets
    // 401 here — swallowed; the board simply renders without a highlight.
    fetch('/api/v1/me', { headers: { accept: 'application/json' } })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: unknown) => {
        if (!active || body == null) return;
        const profile = (body as { data?: { profile?: { slug?: unknown; streak?: { current?: unknown } } } })
          .data?.profile;
        if (typeof profile?.slug === 'string') {
          const current = profile.streak?.current;
          setViewer({ slug: profile.slug, streak: typeof current === 'number' ? current : 0 });
        }
      })
      .catch(() => {
        /* network error → no highlight, board still fully usable */
      });
    return () => {
      active = false;
    };
  }, []);

  const board = useMemo(
    () => boards.find((b) => b.category === selected) ?? boards[0],
    [boards, selected],
  );
  const entries = board?.entries ?? [];

  return (
    <div data-testid="crowd-boards">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <p className="text-muted font-mono text-xs">
          Week of {weekStart}
          {live && (
            <span
              data-testid="crowd-live"
              className="border-muted text-muted ml-2 rounded border px-1.5 py-0.5 text-[10px] font-bold tracking-wide"
            >
              {crowdCopy.liveBadge}
            </span>
          )}
        </p>
      </div>

      {/* Category chips: Overall + each market category. Neutral ink, no gold (D-J8). */}
      <div
        data-testid="crowd-chips"
        role="group"
        aria-label="Leaderboard category"
        className="mb-6 flex flex-wrap gap-2"
      >
        {boards.map((b) => {
          const on = b.category === selected;
          return (
            <button
              key={b.category}
              type="button"
              data-testid={`crowd-chip-${b.category}`}
              aria-pressed={on}
              onClick={() => setSelected(b.category)}
              className={`font-display rounded border-2 px-2.5 py-0.5 text-[11px] font-bold tracking-wide uppercase transition-colors ${
                on ? 'border-paper text-paper' : 'border-muted text-muted'
              }`}
            >
              {chipLabel(b.category)}
            </button>
          );
        })}
      </div>

      {entries.length === 0 ? (
        <p data-testid="crowd-empty" className="text-muted py-8 text-center text-sm">
          {crowdCopy.emptyBoard}
        </p>
      ) : (
        <table data-testid="crowd-board" className="w-full border-collapse font-mono text-sm">
          <caption className="sr-only">
            {chipLabel(selected)} leaderboard, week of {weekStart}
          </caption>
          <thead>
            <tr className="text-muted border-surface border-b text-left text-xs uppercase">
              <th scope="col" className="py-2 pr-2 font-semibold">
                {crowdCopy.colRank}
              </th>
              <th scope="col" className="py-2 pr-2 font-semibold">
                {crowdCopy.colWho}
              </th>
              <th scope="col" className="py-2 pr-2 text-right font-semibold">
                {crowdCopy.colAcc}
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                {crowdCopy.colEdge}
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const isMe = viewer !== null && viewer.slug === entry.profile.slug;
              return (
                <tr
                  key={entry.profile.profile_id}
                  data-testid={isMe ? 'crowd-row-me' : 'crowd-row'}
                  aria-label={isMe ? crowdCopy.youRowLabel : undefined}
                  className={`border-surface/60 border-b ${
                    isMe ? 'bg-surface text-paper' : ''
                  }`}
                >
                  <td className="text-muted py-2 pr-2 tabular-nums">{entry.rank}</td>
                  <td className="py-2 pr-2">
                    <span className="flex items-center gap-2">
                      <Link
                        href={`/p/${entry.profile.slug}`}
                        className="text-paper underline-offset-2 hover:underline"
                      >
                        {entry.profile.handle}
                      </Link>
                      {isMe && viewer.streak > 0 && <StreakFlame count={viewer.streak} />}
                    </span>
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums">
                    {entry.wins}/{entry.picks}
                  </td>
                  <td className="py-2 text-right tabular-nums">{formatEdge(entry.edge_sum)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <p className="text-muted mt-6 font-mono text-xs leading-relaxed">
        {crowdCopy.legendAcc}
        <br />
        {crowdCopy.legendEdge}
      </p>
    </div>
  );
}

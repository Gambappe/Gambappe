/**
 * WS22-T2 · `/crowd` — the Crowd room (D-J7, journeys-plan §5). Weekly leaderboards on the
 * already-built API: Overall + per-topic chips + the edge column. Server-rendered on the dark
 * stage (`bg-bg text-paper` from the root layout), which also keeps any colored chrome clear of
 * the cream-`bg-paper` contrast trap.
 *
 * INV-10 / ISR: this is `revalidate = 60` (§5 AC), so the server HTML must be identical for every
 * viewer. It server-fetches through the lib — `getCrowdBoards(getDb())`, which composes
 * `@receipts/db`'s `getLeaderboardPicksForWeek` repo + `rankLeaderboard` — NOT by HTTP-calling its
 * own `/api/v1/leaderboards/weekly` (no self-HTTP). No cookies are read here and no viewer identity
 * is resolved: the viewer's row highlight (and their own streak flame) hydrates client-side inside
 * `CrowdBoards` via `GET /api/v1/me`, so a returning ghost's cookie never fragments the ISR cache.
 */
import type { Metadata } from 'next';
import { PRODUCT_NAME } from '@receipts/core';
import { getDb } from '@/lib/stores';
import { getCrowdBoards } from '@/lib/leaderboard-page';
import { CrowdBoards } from '@/components/crowd/CrowdBoards';
import { crowdCopy } from '@/lib/copy';

export const revalidate = 60; // §5 AC: /crowd is ISR, 60s (viewer-free HTML, INV-10)

export const metadata: Metadata = {
  title: `Crowd — ${PRODUCT_NAME}`,
  description: 'Weekly leaderboards — the sharpest calls of the week, overall and by topic.',
};

export default async function CrowdPage() {
  const view = await getCrowdBoards(getDb());
  const anyEntries = view.boards.some((b) => b.entries.length > 0);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight">{crowdCopy.heading}</h1>
        <p className="text-muted mt-1 text-sm">{crowdCopy.subheading}</p>
      </header>

      {anyEntries ? (
        <CrowdBoards boards={view.boards} weekStart={view.weekStart} live={view.live} />
      ) : (
        <p data-testid="crowd-empty-week" className="text-muted py-12 text-center text-sm">
          {crowdCopy.emptyWeek}
        </p>
      )}
    </main>
  );
}

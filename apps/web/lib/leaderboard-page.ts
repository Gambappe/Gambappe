/**
 * WS22-T2 · `/crowd` server model (journeys-plan §5 WS22-T2, D-J7). Composes the ALREADY-BUILT
 * weekly-leaderboard pieces — `@receipts/db`'s `getLeaderboardPicksForWeek` (the repo/serializer)
 * + `@/lib/leaderboards`'s pure `rankLeaderboard` — into the boards the Crowd room renders. This
 * is the "server-fetch through the lib, not self-HTTP" path (constraint): the `/crowd` server
 * component calls `getCrowdBoards(getDb())` directly, exactly like `GET /api/v1/leaderboards/weekly`
 * does, instead of HTTP-fetching its own origin. The route keeps its Redis cache; the page relies
 * on ISR (revalidate 60s) as its cache, so the two share the compute (`rankLeaderboard`) without
 * sharing transport.
 *
 * INV-10: this takes a `Db` and an optional clock only — NO request, NO cookies, NO viewer
 * identity. The returned view is byte-identical for every viewer, which is what lets `/crowd` be
 * ISR (the viewer-row highlight hydrates client-side in `CrowdBoards`, never here).
 *
 * SPEC-GAP(ws22-t2): §5's table sketch reads "handle(+streak flame)", but the weekly-leaderboard
 * API/lib this task is required to reuse (`LeaderboardPickRow` → `LeaderboardRankedEntry`) carries
 * NO per-profile streak, and adding one is a `@receipts/db`/`packages/core` contract change owned
 * by a separate core-first PR (§19.4). So no per-row streak is server-rendered here; the viewer's
 * OWN streak flame is hydrated client-side from `GET /api/v1/me` (INV-10-safe), the only streak a
 * viewer-free board can honestly show.
 */
import {
  MARKET_CATEGORY,
  addDaysToDateString,
  etDateString,
  isoWeekMonday,
  now,
  type MarketCategory,
} from '@receipts/core';
import { getLeaderboardPicksForWeek, type Db } from '@receipts/db';
import { rankLeaderboard, type LeaderboardRankedEntry } from './leaderboards';

export type LeaderboardCategory = MarketCategory | 'overall';

/** Chip order: Overall is the default board, then each market category (§5 "Overall + chips"). */
export const CROWD_CATEGORY_ORDER: readonly LeaderboardCategory[] = ['overall', ...MARKET_CATEGORY];

export interface CrowdBoard {
  category: LeaderboardCategory;
  entries: LeaderboardRankedEntry[];
}

export interface CrowdBoardsView {
  /** ISO week Monday (ET-keyed, §8.12), the week the boards cover. */
  weekStart: string;
  /** The in-progress week is shown and labeled "live" (§8.12). */
  live: boolean;
  /** One board per `CROWD_CATEGORY_ORDER` entry, ranked top-100. */
  boards: CrowdBoard[];
}

/**
 * Ranks every board for one week from a single pick scan. Mirrors the route's window math
 * (`isoWeekMonday` normalizes any date to its Mon–Sun window, §8.12) so `/crowd` and the JSON API
 * agree byte-for-byte on membership. `at`/`weekStart` are injectable for deterministic tests.
 */
export async function getCrowdBoards(
  db: Db,
  opts: { weekStart?: string; at?: Date } = {},
): Promise<CrowdBoardsView> {
  const at = opts.at ?? now();
  const todayEt = etDateString(at);
  const weekStart = isoWeekMonday(opts.weekStart ?? todayEt);
  const weekEnd = addDaysToDateString(weekStart, 6);
  const live = todayEt >= weekStart && todayEt <= weekEnd;

  const rows = await getLeaderboardPicksForWeek(db, weekStart, weekEnd);
  const boards: CrowdBoard[] = CROWD_CATEGORY_ORDER.map((category) => ({
    category,
    entries: rankLeaderboard(rows, category),
  }));

  return { weekStart, live, boards };
}

export type { LeaderboardRankedEntry };

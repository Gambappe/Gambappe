import Link from 'next/link';
import { redirect } from 'next/navigation';
import { now } from '@receipts/core';
import { getProfileByUserId } from '@receipts/db';
import { auth } from '../../../auth';
import { NemesisHistoryList } from '@/components/nemesis/NemesisHistoryList';
import type { DayResult } from '@/components/nemesis/VerdictCard';
import { deriveDayResults } from '@/lib/nemesis/verdict';
import { getNemesisHistoryPage, getPairingPublicById, NEMESIS_HISTORY_DEFAULT_LIMIT } from '@/lib/nemesis/service';
import { getDb } from '@/lib/stores';

/**
 * `/nemesis/history` — the claimed viewer's full lifetime nemesis history, split out of
 * `/nemesis/page.tsx` (design-diff audit, same reasoning as the `/nemesis/matchup` split): that
 * page is now about the CURRENT nemesis-week moment only (assignment/verdict/empty state machine,
 * `selectNemesisPageState`), and the mockup itself never shows the aggregate list on the same
 * exhibit as the current-week card — it's a distinct, separate concern with its own private home
 * now, linked from a plain "History" text link at the bottom of `/nemesis`.
 *
 * Auth-gated exactly like `/nemesis/page.tsx` and `/nemesis/matchup/page.tsx` — same `auth()` +
 * `getProfileByUserId` + redirect-to-`/claim` pattern, copied rather than reinvented.
 *
 * Unlike `/nemesis/page.tsx`'s old inline history section, this renders every entry
 * `getNemesisHistoryPage` returns (no promoted-entry exclusion — there's no primary-content card
 * on this page competing for it).
 */
export const dynamic = 'force-dynamic';

export default async function NemesisHistoryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/claim');

  const db = getDb();
  const profile = await getProfileByUserId(db, session.user.id);
  if (!profile || profile.kind !== 'claimed') redirect('/claim');

  const viewerProfileId = profile.id;
  const at = now();
  const historyPage = await getNemesisHistoryPage(db, viewerProfileId, {
    limit: NEMESIS_HISTORY_DEFAULT_LIMIT,
  });

  // SW10-T2: the verdict card's week-strip dots come from each history entry's own pairing
  // scoreboard (`GET /pairings/:id`, `pairingPublicSchema.scoreboard`) — the history entry itself
  // (`nemesisHistoryEntrySchema`) carries no per-day data. Skipped for `cancelled` entries: no
  // verdict card ever renders for those, so the fetch would be wasted.
  const verdictEligible = historyPage.data.filter((entry) => entry.outcome !== 'cancelled');
  const verdictPairings = await Promise.all(
    verdictEligible.map((entry) => getPairingPublicById(db, entry.pairing_id, at)),
  );
  const dayResultsByPairingId: Record<string, ReadonlyArray<DayResult>> = {};
  verdictEligible.forEach((entry, i) => {
    const verdictPairing = verdictPairings[i];
    if (verdictPairing) {
      dayResultsByPairingId[entry.pairing_id] = deriveDayResults(
        verdictPairing.scoreboard,
        viewerProfileId,
        verdictPairing,
      );
    }
  });

  return (
    <main className="mx-auto max-w-xl space-y-6 px-6 py-10">
      <Link href="/nemesis" className="text-muted text-sm underline underline-offset-2">
        ← Your nemesis
      </Link>
      <h1 className="text-2xl font-bold">History</h1>
      <NemesisHistoryList
        viewerProfileId={viewerProfileId}
        viewerHandle={profile.handle}
        entries={historyPage.data}
        dayResultsByPairingId={dayResultsByPairingId}
      />
    </main>
  );
}

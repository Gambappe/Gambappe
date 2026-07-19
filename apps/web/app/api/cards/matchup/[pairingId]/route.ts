/**
 * `GET /api/cards/matchup/:pairingId?format=story|square` (design doc §10.5, WS8-T2): nemesis
 * scoreboard as a shareable story/square PNG.
 */
import { getDb } from '@/lib/stores';
import { loadMatchupOg } from '@/lib/og/entities';
import { handleCardRequest } from '@/lib/og/card-route-handler';
import { matchupPagePath } from '@/lib/og/paths';
import { renderMatchupTemplate } from '@/lib/og/templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ pairingId: string }> },
): Promise<Response> {
  const { pairingId } = await params;
  return handleCardRequest(
    request,
    () => loadMatchupOg(getDb(), pairingId),
    (data) => matchupPagePath(data.pairing.id),
    renderMatchupTemplate,
  );
}

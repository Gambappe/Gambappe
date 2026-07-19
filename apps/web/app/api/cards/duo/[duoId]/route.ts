/**
 * `GET /api/cards/duo/:duoId?format=story|square` (design doc §10.5, WS8-T2): partners + tier
 * + rating as a shareable story/square PNG.
 */
import { getDb } from '@/lib/stores';
import { loadDuoOg } from '@/lib/og/entities';
import { handleCardRequest } from '@/lib/og/card-route-handler';
import { duoPagePath } from '@/lib/og/paths';
import { renderDuoTemplate } from '@/lib/og/templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ duoId: string }> },
): Promise<Response> {
  const { duoId } = await params;
  return handleCardRequest(
    request,
    () => loadDuoOg(getDb(), duoId),
    (data) => duoPagePath(data.duo.id),
    renderDuoTemplate,
  );
}

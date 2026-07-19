/**
 * `GET /api/cards/profile/:slug?format=story|square` (design doc §10.5, WS8-T2): record
 * summary as a shareable story/square PNG.
 */
import { getDb } from '@/lib/stores';
import { loadProfileOg } from '@/lib/og/entities';
import { handleCardRequest } from '@/lib/og/card-route-handler';
import { profilePagePath } from '@/lib/og/paths';
import { renderProfileTemplate } from '@/lib/og/templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;
  return handleCardRequest(
    request,
    () => loadProfileOg(getDb(), slug),
    (data) => profilePagePath(data.profile.slug),
    renderProfileTemplate,
  );
}

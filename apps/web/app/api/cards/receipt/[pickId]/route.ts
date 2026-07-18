/**
 * `GET /api/cards/receipt/:pickId?format=story|square` (design doc §10.5, WS8-T2): a user's
 * pick as a shareable story/square PNG. Loss + busted-streak variants render here too — same
 * equal-treatment posture as the OG route (`renderReceiptTemplate`'s comment), now proven by a
 * real card render, not just an OG one (§10.5 WS8-T2 AC).
 */
import { getDb } from '@/lib/stores';
import { loadReceiptOg } from '@/lib/og/entities';
import { handleCardRequest } from '@/lib/og/card-route-handler';
import { questionPagePath } from '@/lib/og/paths';
import { renderReceiptTemplate } from '@/lib/og/templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ pickId: string }> },
): Promise<Response> {
  const { pickId } = await params;
  return handleCardRequest(
    request,
    () => loadReceiptOg(getDb(), pickId),
    (data) => questionPagePath(data.question.slug),
    renderReceiptTemplate,
  );
}

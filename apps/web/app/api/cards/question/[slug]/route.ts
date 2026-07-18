/**
 * `GET /api/cards/question/:slug?format=story|square` (design doc §10.5, WS8-T2): the
 * question/result/voided card as a shareable story/square PNG — same variant selection as the
 * OG route, just at card dimensions with a real QR footer.
 */
import { getDb } from '@/lib/stores';
import { loadQuestionOg } from '@/lib/og/entities';
import { handleCardRequest } from '@/lib/og/card-route-handler';
import { questionPagePath } from '@/lib/og/paths';
import { renderQuestionTemplate } from '@/lib/og/templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;
  return handleCardRequest(
    request,
    () => loadQuestionOg(getDb(), slug),
    (data) => questionPagePath(data.question.slug),
    renderQuestionTemplate,
  );
}

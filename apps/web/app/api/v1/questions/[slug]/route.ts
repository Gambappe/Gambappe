/**
 * `GET /api/v1/questions/:slug` (design doc §9.2). Public. Any question by slug — same shape as
 * `/questions/today`; revealed questions include outcome + final split (publication rule gate
 * lives in `serializeQuestionPublic`, keyed off the RAW status, never the effective one).
 */
import type { NextResponse } from 'next/server';
import { ApiError, now } from '@receipts/core';
import { getMarketById, getQuestionBySlug } from '@receipts/db';
import { jsonSuccess, runRoute } from '@/lib/api-response';
import { serializeQuestionPublic } from '@/lib/serialize-question';
import { getDb } from '@/lib/stores';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  return runRoute(async () => {
    const { slug } = await params;
    const db = getDb();
    const question = await getQuestionBySlug(db, slug);
    if (!question) throw new ApiError('NOT_FOUND', 'no such question');

    const market = await getMarketById(db, question.marketId);
    if (!market) throw new ApiError('INTERNAL', 'question references a missing market');

    const response = jsonSuccess(serializeQuestionPublic(question, market, now()));
    response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=300');
    return response;
  });
}

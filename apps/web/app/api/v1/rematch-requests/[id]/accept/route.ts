/**
 * `POST /api/v1/rematch-requests/:id/accept` (design doc §8.4 step 0, §9.2, WS5-T5). Claimed;
 * target-only (enforced in `@/lib/nemesis/rematch`'s `respondToRematchRequest`). Replaces
 * `apps/web/lib/nemesis/mock-api.ts`'s `acceptRematchRequest` mock (deleted by this task).
 */
import type { NextResponse } from 'next/server';
import { ApiError, isFlagEnabled, now, respondRematchRequestSchema } from '@receipts/core';
import { jsonSuccess, runRoute } from '@/lib/api-response';
import { assertSameOrigin } from '@/lib/origin-check';
import { resolveIdentityFromRequest } from '@/lib/identity-request';
import { getDb } from '@/lib/stores';
import { respondToRematchRequest } from '@/lib/nemesis/rematch';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  return runRoute(async () => {
    assertSameOrigin(request);
    if (!isFlagEnabled('nemesis')) {
      throw new ApiError('NOT_FOUND', 'nemesis is not available');
    }

    const { identity } = await resolveIdentityFromRequest(request);
    if (identity.kind !== 'claimed') {
      throw new ApiError('UNAUTHENTICATED', 'a claimed profile is required');
    }

    const { id } = respondRematchRequestSchema.shape.params.parse(await params);

    const result = await respondToRematchRequest(getDb(), id, identity.profile.id, 'accept', now());
    return jsonSuccess(result);
  });
}

/**
 * `POST /api/v1/rematch-requests` (design doc §8.4 step 0, §9.2, WS5-T5). Claimed. Body
 * `{target_profile_id}` — target must be a past nemesis this season. Replaces
 * `apps/web/lib/nemesis/mock-api.ts`'s `createRematchRequest` mock (deleted by this task).
 * Behind the `nemesis` flag (§4.6), same posture as every other `/pairings*`/`/rematch-requests*`
 * route. Business logic lives in `@/lib/nemesis/rematch` (§4.3).
 */
import type { NextResponse } from 'next/server';
import { ApiError, createRematchRequestSchema, isFlagEnabled, now } from '@receipts/core';
import { jsonSuccess, runRoute } from '@/lib/api-response';
import { assertSameOrigin } from '@/lib/origin-check';
import { resolveIdentityFromRequest } from '@/lib/identity-request';
import { getDb } from '@/lib/stores';
import { requestRematch } from '@/lib/nemesis/rematch';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<NextResponse> {
  return runRoute(async () => {
    assertSameOrigin(request);
    if (!isFlagEnabled('nemesis')) {
      throw new ApiError('NOT_FOUND', 'nemesis is not available');
    }

    const { identity } = await resolveIdentityFromRequest(request);
    if (identity.kind !== 'claimed') {
      throw new ApiError('UNAUTHENTICATED', 'a claimed profile is required');
    }

    const { body } = createRematchRequestSchema.parse({ body: await request.json() });

    const result = await requestRematch(getDb(), identity.profile.id, body.target_profile_id, now());
    return jsonSuccess(result, { status: 201 });
  });
}

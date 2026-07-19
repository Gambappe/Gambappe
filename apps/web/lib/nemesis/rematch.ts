/**
 * Rematch-request business logic (design doc §8.4 step 0, §9.2 `POST /rematch-requests*`,
 * WS5-T5). This is the REQUEST-side write path — the read/consume side (`nemesis:assign`
 * pairing mutually-accepted requests, sweeping the rest to `expired`) already shipped in
 * WS5-T1's `apps/worker/src/jobs/nemesis-assign.ts` + `packages/db/src/repositories/nemesis.ts`.
 *
 * Replaces `apps/web/lib/nemesis/mock-api.ts` (deleted by this task — see its former header for
 * the full mock-vs-real handoff history): every function here returns exactly the same
 * `@receipts/core` response shapes (`createRematchResponseSchema`/`respondRematchResponseSchema`)
 * the mock produced, so `RematchPanel`'s prop/state shapes don't need to change.
 *
 * "Mutual accept" (§8.4 step 0) = the requester's creation call (implicit consent) + the
 * target's explicit accept (`respondToRematchRequest` below, `action: 'accept'`) — a single
 * `rematch_requests` row moving `open -> accepted`. Acceptance does NOT create a pairing on the
 * spot; the next `nemesis:assign` run (Monday 09:00 ET) does that (§8.4 step 0), same as the
 * mock's copy already told users ("you'll be paired starting next week").
 */
import { uuidv7 } from 'uuidv7';
import { ApiError, etDateString, now } from '@receipts/core';
import {
  createRematchResponseSchema,
  respondRematchResponseSchema,
  rematchRequestSchema,
} from '@receipts/core';
import {
  findOpenRematchRequestFromTo,
  getNemesisSeasonCoveringDate,
  getRematchRequestById,
  insertRematchRequest,
  sendNotification,
  updateRematchRequestStatus,
  wasNemesisThisSeason,
  type Db,
  type RematchRequestRow,
} from '@receipts/db';

function toRematchRequest(row: RematchRequestRow) {
  return rematchRequestSchema.parse({
    id: row.id,
    requester_profile_id: row.requesterProfileId,
    target_profile_id: row.targetProfileId,
    season_id: row.seasonId,
    status: row.status,
    created_at: row.createdAt.toISOString(),
  });
}

/**
 * `POST /rematch-requests` (claimed). §9.2: "target must be a past nemesis this season" — "this
 * season" = the nemesis season covering `at` (the currently active one; there's no other season
 * a fresh rematch could ever land in, since acceptance only ever feeds the NEXT assignment run).
 * Idempotent: a repeat call while an identical open request already exists returns that same
 * row rather than erroring or duplicating (mirrors `mock-api.ts`'s original behavior).
 */
export async function requestRematch(
  db: Db,
  requesterProfileId: string,
  targetProfileId: string,
  at: Date = now(),
) {
  if (requesterProfileId === targetProfileId) {
    throw new ApiError('VALIDATION_FAILED', 'cannot request a rematch against yourself');
  }

  const season = await getNemesisSeasonCoveringDate(db, etDateString(at));
  if (!season) {
    throw new ApiError('VALIDATION_FAILED', 'no active nemesis season right now');
  }

  const eligible = await wasNemesisThisSeason(db, requesterProfileId, targetProfileId, season.id);
  if (!eligible) {
    throw new ApiError('VALIDATION_FAILED', 'target must be a past nemesis this season');
  }

  const existing = await findOpenRematchRequestFromTo(db, requesterProfileId, targetProfileId);
  if (existing) {
    return createRematchResponseSchema.parse({ request: toRematchRequest(existing) });
  }

  const inserted = await insertRematchRequest(db, {
    id: uuidv7(),
    requesterProfileId,
    targetProfileId,
    seasonId: season.id,
  });

  // SPEC-GAP(ws5-t5): `nemesis_rematch_requested` is a placeholder kind mirroring
  // `duo-disband.ts`'s `duo_disbanded` precedent — no `packages/engine` narration beat exists
  // for it (§13.3's catalog doesn't cover rematch-request beats), so this carries a raw payload
  // with no pre-rendered `line` (the email template's per-category fallback line covers it,
  // `notification-email-template.ts`). The `nemesis_` prefix is deliberate — it puts this under
  // the `nemesis` settings category (`email_nemesis`/`push_nemesis`, §9.4), which is the
  // correct opt-out for a nemesis-flavored beat (the bare-string catch-all would otherwise fall
  // into the unrelated `product` category, `@receipts/core`'s `notificationCategoryForKind`).
  const payload = { rematch_request_id: inserted.id, requester_profile_id: requesterProfileId };
  await sendNotification(
    db,
    targetProfileId,
    'nemesis_rematch_requested',
    payload,
    'email',
    `nemesis_rematch_requested:${inserted.id}:email`,
    at,
  );
  await sendNotification(
    db,
    targetProfileId,
    'nemesis_rematch_requested',
    payload,
    'push',
    `nemesis_rematch_requested:${inserted.id}:push`,
    at,
  );

  return createRematchResponseSchema.parse({ request: toRematchRequest(inserted) });
}

export type RespondAction = 'accept' | 'decline';

/**
 * `POST /rematch-requests/:id/accept` | `/decline` (claimed). Only the request's TARGET may
 * respond — the requester already consented by creating it (see this file's header). Throws
 * `NOT_FOUND` for an unknown id, `FORBIDDEN` for a non-target actor, `VALIDATION_FAILED` for an
 * already-resolved request (accept/decline is a one-shot action on an `open` request).
 */
export async function respondToRematchRequest(
  db: Db,
  requestId: string,
  actingProfileId: string,
  action: RespondAction,
  at: Date = now(),
) {
  const existing = await getRematchRequestById(db, requestId);
  if (!existing) throw new ApiError('NOT_FOUND', 'rematch request not found');
  if (existing.targetProfileId !== actingProfileId) {
    throw new ApiError('FORBIDDEN', 'only the request target may accept or decline');
  }
  if (existing.status !== 'open') {
    throw new ApiError('VALIDATION_FAILED', `request is already ${existing.status}`);
  }

  const newStatus = action === 'accept' ? 'accepted' : 'declined';
  const updated = await updateRematchRequestStatus(db, requestId, newStatus);
  if (!updated) {
    // Lost a race against a concurrent accept/decline of the same request between the read
    // above and this write — treat identically to "already resolved" rather than a 500.
    throw new ApiError('VALIDATION_FAILED', 'request is already resolved');
  }

  const kind = action === 'accept' ? 'nemesis_rematch_accepted' : 'nemesis_rematch_declined';
  await sendNotification(
    db,
    updated.requesterProfileId,
    kind,
    { rematch_request_id: updated.id, target_profile_id: actingProfileId },
    'email',
    `${kind}:${updated.id}:email`,
    at,
  );
  await sendNotification(
    db,
    updated.requesterProfileId,
    kind,
    { rematch_request_id: updated.id, target_profile_id: actingProfileId },
    'push',
    `${kind}:${updated.id}:push`,
    at,
  );

  return respondRematchResponseSchema.parse({ request: toRematchRequest(updated) });
}

/**
 * Nemesis pairing API schemas (design doc §9.2, §9.3 masking, §5.5, §8.8).
 */
import { z } from 'zod';
import { MARKET_SIDE, PAIRING_STATUS, PICK_RESULT, QUESTION_KIND, REMATCH_STATUS } from '../enums.js';
import { zPairingId, zProfileId, zQuestionId, zRematchRequestId, zSeasonId } from '../ids.js';
import { listEnvelopeSchema, paginationQuerySchema, zDateOnly, zSlug, zTimestamp } from './common.js';
import { profileRefSchema } from './profiles.js';

/**
 * One shared question on the pairing scoreboard. Opponent picks on a shared question are
 * masked (null) until that question locks (§9.3); pre-reveal daily results are masked too.
 */
export const pairingScoreboardRowSchema = z.object({
  question_id: zQuestionId,
  slug: zSlug,
  kind: z.enum(QUESTION_KIND),
  question_date: zDateOnly.nullable(),
  a: z
    .object({ side: z.enum(MARKET_SIDE), result: z.enum(PICK_RESULT).nullable() })
    .nullable(),
  b: z
    .object({ side: z.enum(MARKET_SIDE), result: z.enum(PICK_RESULT).nullable() })
    .nullable(),
});

/** Public matchup shape (both handles, daily-by-daily scoreboard, narration line — §9.2). */
export const pairingPublicSchema = z.object({
  id: zPairingId,
  season_id: zSeasonId,
  week_start: zDateOnly,
  status: z.enum(PAIRING_STATUS),
  is_rematch: z.boolean(),
  a: profileRefSchema,
  b: profileRefSchema,
  score: z.object({ a: z.number().int().nonnegative(), b: z.number().int().nonnegative() }),
  winner_profile_id: zProfileId.nullable(),
  narrative_line: z.string().nullable(),
  scoreboard: z.array(pairingScoreboardRowSchema),
});

// --- GET /pairings/current (claimed): my active pairing + scoreboard --------------------------

export const getCurrentPairingRequestSchema = z.object({});
export const getCurrentPairingResponseSchema = z.object({
  pairing: pairingPublicSchema.nullable(),
});

// --- GET /pairings/:id (none): public matchup page --------------------------------------------

export const getPairingRequestSchema = z.object({
  params: z.object({ id: zPairingId }),
});
export const getPairingResponseSchema = pairingPublicSchema;

// --- GET /me/nemesis-history (claimed): lifetime records vs past nemeses ----------------------

/**
 * WS5-T5 contract-change (flagged, additive): the viewer's rematch-request state with THIS
 * history entry's opponent, if any request exists between them (either direction). §9.2's
 * `POST /rematch-requests` family has no documented `GET` for discovering a request's id (the
 * SPEC-GAP `apps/web/lib/nemesis/mock-api.ts`'s header recorded for whoever built this task) —
 * rather than minting an undocumented new endpoint, this folds discovery into the ALREADY-
 * contracted `GET /me/nemesis-history` response, which is exactly where a per-opponent rematch
 * affordance is rendered (`RematchPanel`, one per history row). `direction` is from the
 * viewer's point of view: `outgoing` = viewer is `requester_profile_id`, `incoming` = viewer is
 * `target_profile_id`. When both directions exist for the same opponent (each side
 * independently requested the other — §8.4 step 0's "both sides independently requested each
 * other" case), the more actionable one wins: an `open` request beats a resolved one; if both
 * are `open`, `incoming` wins (something for the viewer to act on beats something to wait on).
 */
export const nemesisRematchStateSchema = z.object({
  id: zRematchRequestId,
  direction: z.enum(['outgoing', 'incoming']),
  status: z.enum(REMATCH_STATUS),
});

export const nemesisHistoryEntrySchema = z.object({
  pairing_id: zPairingId,
  season_id: zSeasonId,
  week_start: zDateOnly,
  opponent: profileRefSchema,
  my_score: z.number().int().nonnegative(),
  their_score: z.number().int().nonnegative(),
  outcome: z.enum(['win', 'loss', 'draw', 'cancelled']),
  is_rematch: z.boolean(),
  rematch_request: nemesisRematchStateSchema.nullable(),
});

export const getNemesisHistoryRequestSchema = z.object({ query: paginationQuerySchema });
export const getNemesisHistoryResponseSchema = listEnvelopeSchema(nemesisHistoryEntrySchema);

// --- Rematch requests (§9.2, §8.4 step 0) -----------------------------------------------------

export const rematchRequestSchema = z.object({
  id: zRematchRequestId,
  requester_profile_id: zProfileId,
  target_profile_id: zProfileId,
  season_id: zSeasonId,
  status: z.enum(REMATCH_STATUS),
  created_at: zTimestamp,
});

export const createRematchBodySchema = z
  .object({
    /** Target must be a past nemesis this season (§9.2). */
    target_profile_id: zProfileId,
  })
  .strict();

export const createRematchRequestSchema = z.object({ body: createRematchBodySchema });
export const createRematchResponseSchema = z.object({ request: rematchRequestSchema });

export const respondRematchRequestSchema = z.object({
  params: z.object({ id: zRematchRequestId }),
});
export const respondRematchResponseSchema = z.object({ request: rematchRequestSchema });

/**
 * Threads: posts + reactions (design doc §9.2, §5.6).
 * Same thread shape at /questions/:slug/thread, /pairings/:id/thread, /duo-matches/:id/thread.
 */
import { z } from 'zod';
import { PAIRING_REACTION_SET, POST_MAX_CHARS, REACTION_SET } from '../config.js';
import { POST_STATUS, THREAD_CONTEXT } from '../enums.js';
import { zPairingId, zDuoMatchId, zPostId, zProfileId, zQuestionId } from '../ids.js';
import { paginationQuerySchema, zSlug, zTimestamp } from './common.js';

export const reactionEmojiSchema = z.enum(REACTION_SET);
/** SW10-T4: preset text stamps for a nemesis matchup (`context_kind: 'pairing'`) — validates
 * against `PAIRING_REACTION_SET`, NOT `REACTION_SET` (see that constant's own doc comment for
 * why the two must stay separate). */
export const pairingReactionEmojiSchema = z.enum(PAIRING_REACTION_SET);
export type PairingReactionEmoji = z.infer<typeof pairingReactionEmojiSchema>;

export const postSchema = z.object({
  id: zPostId,
  context_kind: z.enum(THREAD_CONTEXT),
  context_id: z.string().uuid(),
  author: z.object({
    profile_id: zProfileId,
    handle: z.string(),
    slug: zSlug,
  }),
  body: z.string().max(POST_MAX_CHARS),
  status: z.enum(POST_STATUS),
  created_at: zTimestamp,
});

export const reactionCountSchema = z.object({
  emoji: reactionEmojiSchema,
  count: z.number().int().nonnegative(),
});

/** Posts + reaction counts, paginated (§9.2). */
export const threadResponseSchema = z.object({
  data: z.object({
    posts: z.array(postSchema),
    reaction_counts: z.array(reactionCountSchema),
  }),
  meta: z.object({ next_cursor: z.string().nullable() }),
});

// --- GET /questions/:slug/thread --------------------------------------------------------------

export const getQuestionThreadRequestSchema = z.object({
  params: z.object({ slug: zSlug }),
  query: paginationQuerySchema,
});
export const getQuestionThreadResponseSchema = threadResponseSchema;

// --- GET /pairings/:id/thread -----------------------------------------------------------------

export const getPairingThreadRequestSchema = z.object({
  params: z.object({ id: zPairingId }),
  query: paginationQuerySchema,
});
export const getPairingThreadResponseSchema = threadResponseSchema;

// --- GET /duo-matches/:id/thread --------------------------------------------------------------

export const getDuoMatchThreadRequestSchema = z.object({
  params: z.object({ id: zDuoMatchId }),
  query: paginationQuerySchema,
});
export const getDuoMatchThreadResponseSchema = threadResponseSchema;

// --- POST posts (claimed only; §9.2) ----------------------------------------------------------

export const createPostBodySchema = z
  .object({
    body: z.string().min(1).max(POST_MAX_CHARS),
  })
  .strict();

export const createQuestionPostRequestSchema = z.object({
  params: z.object({ id: zQuestionId }),
  body: createPostBodySchema,
});
export const createPairingPostRequestSchema = z.object({
  params: z.object({ id: zPairingId }),
  body: createPostBodySchema,
});
export const createDuoMatchPostRequestSchema = z.object({
  params: z.object({ id: zDuoMatchId }),
  body: createPostBodySchema,
});
export const createPostResponseSchema = z.object({ post: postSchema });

// --- POST /reactions (ghost+ for question/duo_match — toggle semantics, 2nd call removes;
// claimed-participant-only + replace semantics for pairing — §9.2, SW10-T4) ------------------

/**
 * `question`/`duo_match` reactions keep the original `REACTION_SET` emoji + toggle semantics
 * (§9.2). Written as a plain (non-literal) `z.enum` over the two non-pairing `THREAD_CONTEXT`
 * members rather than reusing the full enum, so this branch can never accept `'pairing'` —
 * the pairing branch below is the only one `pairingReactionEmojiSchema`-typed values validate
 * against.
 */
const nonPairingReactionBodySchema = z
  .object({
    context_kind: z.enum(['question', 'duo_match']),
    context_id: z.string().uuid(),
    emoji: reactionEmojiSchema,
  })
  .strict();

/**
 * SW10-T4 (wiring-gaps doc §4): a SEPARATE sibling schema for `context_kind: 'pairing'`,
 * validating `emoji` against `pairingReactionEmojiSchema` (`PAIRING_REACTION_SET`) instead of
 * `REACTION_SET` — never a shared/extended enum (see `PAIRING_REACTION_SET`'s own doc comment).
 * Semantics differ from the toggle-based branch above too: one stamp per player per ET calendar
 * day, and a same-day repost REPLACES the day's stamp rather than toggling it off (implementer's
 * documented choice — a "trash talk" stamp changing your mind mid-day is more useful than a
 * silent delete) — see `createReactionResponseSchema`'s `'replaced'` state below and
 * `apps/web/lib/nemesis/reactions.ts` for the write-path enforcement this schema feeds.
 */
const pairingReactionBodySchema = z
  .object({
    context_kind: z.literal('pairing'),
    context_id: z.string().uuid(),
    emoji: pairingReactionEmojiSchema,
  })
  .strict();

export const createReactionBodySchema = z.union([
  nonPairingReactionBodySchema,
  pairingReactionBodySchema,
]);

export const createReactionRequestSchema = z.object({
  body: createReactionBodySchema,
});

export const createReactionResponseSchema = z.object({
  /** `'replaced'` only ever comes back for `context_kind: 'pairing'` (see that branch's own
   * replace-semantics note above) — `question`/`duo_match` reactions only ever report
   * `'added'`/`'removed'` (unchanged toggle behavior). */
  state: z.enum(['added', 'removed', 'replaced']),
});

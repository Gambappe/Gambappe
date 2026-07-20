/**
 * Client-side (browser) typed fetch wrapper for pairing (nemesis matchup) preset-stamp
 * reactions (wiring-gaps doc §4 SW10-T4). Mirrors `thread-client.ts`'s own `submitReaction`
 * (reuses `request()` from `pick-client.ts` for the same envelope-unwrap/error-mapping
 * behavior) but targets the `context_kind: 'pairing'` branch of the same `POST /reactions`
 * endpoint, which has different auth (claimed-only) and semantics (replace, not toggle) —
 * see `app/api/v1/reactions/route.ts` and `lib/nemesis/reactions.ts` for the server side.
 */
import { createReactionBodySchema, createReactionResponseSchema, type PairingReactionEmoji } from '@receipts/core';
import type { z } from 'zod';
import { request, type ApiResult } from '../pick-client';

type CreateReactionResponse = z.infer<typeof createReactionResponseSchema>;

/** `POST /api/v1/reactions` for `context_kind: 'pairing'` (claimed only; a same-day repost
 * replaces the day's stamp — see this task's server-side doc comments for why). */
export async function submitPairingReaction(
  pairingId: string,
  emoji: PairingReactionEmoji,
): Promise<ApiResult<CreateReactionResponse>> {
  const parsedBody = createReactionBodySchema.parse({
    context_kind: 'pairing',
    context_id: pairingId,
    emoji,
  });
  return request(
    '/api/v1/reactions',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(parsedBody),
    },
    createReactionResponseSchema,
  );
}

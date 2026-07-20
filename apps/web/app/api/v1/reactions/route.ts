/**
 * `POST /api/v1/reactions` (design doc §9.2). Two distinct auth/semantics branches, split by
 * `context_kind` (SW10-T4, wiring-gaps doc §4):
 *
 *  - `question`/`duo_match`: `ghost+` — a ghost is minted lazily on the first reaction just like
 *    a first pick (§6.1.1: "first pick, reaction, or placement answer"), so this uses
 *    `resolveOrMintIdentity` (same as the picks route) rather than treating an anonymous caller
 *    as an error. Toggle semantics: identical `{context_kind, context_id, emoji}` twice in a row
 *    adds then removes.
 *  - `pairing` (SW10-T4): claimed-only — a ghost reacting to a nemesis matchup is rejected
 *    server-side (the client's claim-prompt nudge is UX only, not enforcement), so this branch
 *    resolves identity WITHOUT minting a ghost (`resolveIdentityFromRequest`, mirroring
 *    `POST /blocks`'s same "a claimed profile is required" convention) rather than wastefully
 *    minting one just to reject it. One stamp per player per ET calendar day; a same-day repost
 *    REPLACES the stamp. Block severance (§14.3) and the pairing's own two-participants-only
 *    rule are enforced in `lib/nemesis/reactions.ts` — see that file's header for the full
 *    rejection order and reasoning (no existing layer covers reactions at all).
 *
 * Both branches share the same rate limit (§14.1: 100/day per profile).
 */
import type { NextResponse } from 'next/server';
import { ApiError, createReactionBodySchema, now } from '@receipts/core';
import { jsonError, jsonSuccess } from '@/lib/api-response';
import { assertSameOrigin } from '@/lib/origin-check';
import { resolveIdentityFromRequest } from '@/lib/identity-request';
import { resolveOrMintIdentity, applyIdentityCookies, type ResolvedOrMintedIdentity } from '@/lib/pick-identity';
import { enforceRateLimit } from '@/lib/rate-limit';
import { submitReaction } from '@/lib/threads';
import { submitPairingReaction } from '@/lib/nemesis/reactions';
import { getDb } from '@/lib/stores';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertSameOrigin(request);

    const body = createReactionBodySchema.parse(await request.json());

    if (body.context_kind === 'pairing') {
      // No `resolveOrMintIdentity` here — pairing reactions are claimed-only, so minting a
      // ghost for an anonymous caller just to immediately reject it would be wasted work (and
      // would needlessly burn that IP's ghost-mint rate-limit bucket, §6.1.1).
      const { identity } = await resolveIdentityFromRequest(request);
      if (identity.kind !== 'claimed') {
        throw new ApiError('UNAUTHENTICATED', 'a claimed profile is required');
      }

      const limited = await enforceRateLimit('reactions', identity.profile.id);
      if (limited) return limited;

      const state = await submitPairingReaction(
        getDb(),
        {
          pairingId: body.context_id,
          profileId: identity.profile.id,
          profileKind: identity.profile.kind,
          emoji: body.emoji,
        },
        now(),
      );
      return jsonSuccess({ state });
    }

    // Hoisted for the same reason as the picks route: a freshly-minted ghost's cookie must be
    // applied on every response path reached after minting, error or not (§6.1.1).
    let resolved: ResolvedOrMintedIdentity | undefined;
    try {
      resolved = await resolveOrMintIdentity(request);

      const limited = await enforceRateLimit('reactions', resolved.profile.id);
      if (limited) {
        applyIdentityCookies(limited, resolved);
        return limited;
      }

      const result = await submitReaction(getDb(), {
        contextKind: body.context_kind,
        contextId: body.context_id,
        profileId: resolved.profile.id,
        emoji: body.emoji,
      });
      if (!result) {
        const response = jsonError(new ApiError('NOT_FOUND', 'no such context'));
        applyIdentityCookies(response, resolved);
        return response;
      }

      const response = jsonSuccess({ state: result });
      applyIdentityCookies(response, resolved);
      return response;
    } catch (err) {
      const response = jsonError(err);
      if (resolved) applyIdentityCookies(response, resolved);
      return response;
    }
  } catch (err) {
    return jsonError(err);
  }
}

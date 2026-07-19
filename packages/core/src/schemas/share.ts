/**
 * `POST /api/share/token` body (design doc §10.5, WS8-T2): mints a `?r=` share attribution
 * token for one of the five artifact kinds. This route is a sibling of `/api/og/*` and
 * `/api/cards/*` (§10.5's own surface, not a §9.2 endpoint) so — matching those — it is
 * deliberately NOT added to `schemas/registry.ts`'s `API_CONTRACT`/`SPEC_ENDPOINTS`, which is
 * pinned to the design doc's §9.2 table verbatim (see that file's own header comment).
 */
import { z } from 'zod';
import { SHARE_ARTIFACT_KIND } from '../enums.js';

export const shareTokenBodySchema = z
  .object({
    artifact_kind: z.enum(SHARE_ARTIFACT_KIND),
  })
  .strict();

export const shareTokenResponseSchema = z.object({
  token: z.string().min(1),
});

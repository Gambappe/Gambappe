/**
 * Canonical public page paths for each §10.5 share artifact kind, and the `NEXT_PUBLIC_APP_URL`
 * join. Pulled out of `templates.tsx` (WS8-T1) so the WS8-T2 card route handler can compute the
 * exact same path a template renders into its footer/QR — one source of truth, not two url
 * builders that could drift. `receipt` has no page of its own (no `/r/*` route exists in the
 * §10.1 route table) — its footer/QR point at the underlying question page, same as the
 * `receipt` OG template already did before this file existed.
 */
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? 'https://receipts.example';

/**
 * `questions.slug` is a nullable DB column (schema §5.3) even though every caller here fetched
 * the row BY that exact non-null slug (or, for `receipt`, by a graded pick's question, which in
 * practice always has one) — the type is looser than the real invariant. `string | null` here
 * (rather than a hard runtime assertion) preserves the exact same template-literal coercion the
 * OG templates already did pre-WS8-T2 for this edge case, rather than changing behavior for a
 * state this function can't actually observe happening.
 */
export function questionPagePath(slug: string | null): string {
  return `/q/${slug}`;
}

export function matchupPagePath(pairingId: string): string {
  return `/vs/${pairingId}`;
}

export function profilePagePath(slug: string): string {
  return `/p/${slug}`;
}

export function duoPagePath(duoId: string): string {
  return `/duos/${duoId}`;
}

export function absoluteUrl(path: string): string {
  return `${APP_URL()}${path}`;
}

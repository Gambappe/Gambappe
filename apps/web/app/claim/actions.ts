'use server';

/**
 * Sign-in server actions for the claim flow (design doc §6.3: "Auth.js sign-in (email link /
 * Google / X)"). Thin wrappers around Auth.js v5's server `signIn()` so the client-side
 * `ClaimEntry` component can invoke them as `<form action={...}>` targets (the officially
 * documented App Router pattern — see `next-auth`'s own `index.d.ts` doc comment on `signIn`).
 *
 * Every provider redirects back to `/claim` (§6.3: "post-auth landing"), which is the single
 * canonical place `POST /api/v1/claim` gets called from, regardless of which page the claim
 * prompt was triggered on (a claim overlay opened from an arbitrary page can't reliably still be
 * mounted after an OAuth round trip away from and back to the browser).
 *
 * Design-diff follow-up to WS25: `signInOrRedirect` guards every provider call against a
 * server-action-only crash — see `../../lib/auth-signin-redirect.ts`'s header for the mechanism.
 */
import { signIn } from '../../auth';
import { redirectOnAuthError } from '../../lib/auth-signin-redirect';

const CLAIM_CALLBACK_URL = '/claim';

async function signInOrRedirect(
  provider: Parameters<typeof signIn>[0],
  options: Parameters<typeof signIn>[1],
): Promise<void> {
  try {
    await signIn(provider, options);
  } catch (err) {
    redirectOnAuthError(err);
    throw err;
  }
}

export async function signInWithGoogle(): Promise<void> {
  await signInOrRedirect('google', { redirectTo: CLAIM_CALLBACK_URL });
}

export async function signInWithTwitter(): Promise<void> {
  await signInOrRedirect('twitter', { redirectTo: CLAIM_CALLBACK_URL });
}

export async function signInWithEmail(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim();
  await signInOrRedirect('email', { email, redirectTo: CLAIM_CALLBACK_URL });
}

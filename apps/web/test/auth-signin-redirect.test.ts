/**
 * Design-diff follow-up to WS25: regression coverage for the server-action-only crash described
 * in `lib/auth-signin-redirect.ts`'s header. `redirect()`/`unstable_rethrow` (from
 * `next/navigation`) work outside a real request context — they just throw/inspect a
 * specially-tagged `Error`, no App Router runtime needed — so this is testable directly under
 * vitest without a running server, unlike `auth.ts` itself.
 */
import { describe, expect, it } from 'vitest';
import { redirect } from 'next/navigation';
import { AuthError, EmailSignInError } from '@auth/core/errors';
import { redirectOnAuthError, SIGNIN_ERROR_REDIRECT } from '../lib/auth-signin-redirect';

function captureRedirectError(): Error {
  try {
    redirect('/wherever');
  } catch (err) {
    return err as Error;
  }
  throw new Error('redirect() did not throw');
}

describe('redirectOnAuthError', () => {
  it('redirects to /claim?error=Configuration on an AuthError (e.g. EmailSignInError)', () => {
    expect(() => redirectOnAuthError(new EmailSignInError('too many sign-in emails'))).toThrow(
      expect.objectContaining({
        digest: expect.stringContaining(`NEXT_REDIRECT;replace;${SIGNIN_ERROR_REDIRECT}`),
      }),
    );
  });

  it('redirects on a bare AuthError too, not just its subclasses', () => {
    expect(() => redirectOnAuthError(new AuthError('boom'))).toThrow(
      expect.objectContaining({ digest: expect.stringContaining('NEXT_REDIRECT') }),
    );
  });

  it("re-throws Next.js's own internal redirect marker unchanged, instead of masking it as a sign-in failure", () => {
    // Reproduces exactly what happens when the wrapped `signIn(...)` call redirects on its own
    // SUCCESS path: `next-auth`'s `signIn()` calls `next/navigation`'s `redirect()` internally,
    // which is caught by the same `catch` block `redirectOnAuthError` is called from. A naive
    // catch-all would misroute a successful sign-in to the error page instead of letting the
    // framework's own redirect through.
    const redirectError = captureRedirectError();
    expect(() => redirectOnAuthError(redirectError)).toThrow(redirectError);
  });

  it('does nothing (returns normally) for an error it does not recognize, leaving the caller to re-throw', () => {
    expect(() => redirectOnAuthError(new Error('some unrelated crash'))).not.toThrow();
  });
});

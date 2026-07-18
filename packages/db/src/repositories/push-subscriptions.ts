/**
 * `push_subscriptions` repository (design doc §5.6, §13.2, WS9-T2). One row per browser
 * subscription (`endpoint` is globally unique — a browser install, not a profile). Revocation
 * is soft (`revoked_at`) rather than a delete: `notify:dispatch`'s push pass needs to tell "this
 * endpoint is gone, stop trying" (a 404/410 from the push service) apart from "never existed."
 */
import { and, eq, isNull } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import type { Db } from '../client.js';
import { pushSubscriptions } from '../schema/index.js';

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

/**
 * Re-subscribing the same `endpoint` (e.g. the browser refreshed its push registration, or a
 * different profile claimed the same device) reassigns `profile_id`/`keys` and un-revokes —
 * `onConflictDoUpdate` rather than `onConflictDoNothing`, since a stale `keys` blob would make
 * every future push to that endpoint fail encryption.
 */
export async function upsertPushSubscription(
  db: Db,
  profileId: string,
  endpoint: string,
  keys: PushSubscriptionKeys,
): Promise<PushSubscriptionRow> {
  const [row] = await db
    .insert(pushSubscriptions)
    .values({ id: uuidv7(), profileId, endpoint, keys })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { profileId, keys, revokedAt: null },
    })
    .returning();
  if (!row) throw new Error('upsertPushSubscription: no row returned');
  return row;
}

/** Soft-delete by endpoint — used both by the unsubscribe API and by `notify:dispatch` when the
 * push service reports the endpoint gone (404/410). Idempotent: revoking an already-revoked or
 * unknown endpoint is a silent no-op, not an error. */
export async function revokePushSubscriptionByEndpoint(db: Db, endpoint: string, at: Date): Promise<void> {
  await db
    .update(pushSubscriptions)
    .set({ revokedAt: at })
    .where(and(eq(pushSubscriptions.endpoint, endpoint), isNull(pushSubscriptions.revokedAt)));
}

export async function listActivePushSubscriptionsForProfile(
  db: Db,
  profileId: string,
): Promise<PushSubscriptionRow[]> {
  return db
    .select()
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.profileId, profileId), isNull(pushSubscriptions.revokedAt)));
}

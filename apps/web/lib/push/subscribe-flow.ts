/**
 * `POST|DELETE /api/v1/push/subscribe` logic (design doc §13.2, WS9-T2), split out from the
 * route handler so it's testable without faking a next-auth session — mirrors `wallet-flow.ts`
 * (WS12) and `moderation.ts`'s (WS11-T3) split for the same reason.
 */
import type { Db } from '@receipts/db';
import { revokePushSubscriptionByEndpoint, upsertPushSubscription } from '@receipts/db';

export interface SubscribePushInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function subscribePush(
  db: Db,
  profileId: string,
  input: SubscribePushInput,
): Promise<{ subscribed: true }> {
  await upsertPushSubscription(db, profileId, input.endpoint, input.keys);
  return { subscribed: true };
}

export async function unsubscribePush(db: Db, endpoint: string, at: Date): Promise<{ unsubscribed: true }> {
  await revokePushSubscriptionByEndpoint(db, endpoint, at);
  return { unsubscribed: true };
}

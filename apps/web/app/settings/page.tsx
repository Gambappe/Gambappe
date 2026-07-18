/**
 * `/settings` (design doc §10.1: "client | me | incl. wallet linking, deletion"; WS7-T9). All
 * data is viewer-specific (`GET /me`), so this server component does no SSR data fetching of its
 * own — it exists only to read `process.env.VAPID_PUBLIC_KEY`/the `web_push` flag server-side
 * (mirrors `PushOptInButton`'s own rationale for taking the key as a prop) and hand it down to
 * the client island that does everything else.
 */
import { isFlagEnabled } from '@receipts/core';
import SettingsClient from '@/components/settings/SettingsClient';
import { settingsCopy } from '@/lib/copy';

export default function SettingsPage() {
  const vapidPublicKey =
    isFlagEnabled('web_push') && process.env.VAPID_PUBLIC_KEY
      ? process.env.VAPID_PUBLIC_KEY
      : null;

  return (
    <main className="mx-auto max-w-lg space-y-6 px-6 py-10">
      <h1 className="text-lg font-semibold">{settingsCopy.heading}</h1>
      <SettingsClient vapidPublicKey={vapidPublicKey} />
    </main>
  );
}

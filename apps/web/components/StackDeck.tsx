'use client';

import { useEffect, useState } from 'react';
import { stackFeedSchema, type StackFeed } from '@receipts/core';
import { DeckQueue } from './DeckQueue';

export interface StackDeckProps {
  /** The stack feed assembled server-side (`app/page.tsx`, viewer-free per INV-10). This is the
   * FIRST-paint deck; a viewer-scoped feed is fetched post-hydration to honor topic follows. */
  feed: StackFeed;
  serverOffsetMs: number;
  arm?: boolean;
  duoQueue?: boolean;
  rivalHandle?: string | null;
}

/**
 * The home `/` stack. There is NO topic picker here (it lives on `/you` — keeping `/` uncluttered);
 * this wrapper's only job is to make the deck reflect the viewer's topic follows without breaking
 * `/`'s viewer-free SSR (INV-10).
 *
 * The first paint is the server's viewer-free, all-categories `feed` prop — byte-identical for
 * every visitor. Once hydrated, we refetch `GET /api/v1/stack` ONCE (that route resolves the
 * viewer and deals their followed categories, empty follows = all) and swap the feed, so `DeckQueue`
 * re-deals via its `reset` effect. A ghost with no follows gets the same all-categories feed back
 * (no visible change); a viewer who set topics on `/you` sees exactly those here.
 */
export function StackDeck({ feed: initialFeed, serverOffsetMs, arm, duoQueue, rivalHandle }: StackDeckProps) {
  const [feed, setFeed] = useState<StackFeed>(initialFeed);

  useEffect(() => {
    // Empty deps → runs once per mount (twice under React StrictMode in dev, which is harmless: the
    // GET is idempotent and only the live effect's `cancelled` guard gates `setFeed`). A ref-based
    // "run once ever" guard would defeat StrictMode's cleanup and drop the swap in dev.
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/v1/stack', {
          headers: { accept: 'application/json' },
          cache: 'no-store',
        });
        if (!res.ok) return;
        const json = (await res.json()) as { data?: unknown };
        const parsed = stackFeedSchema.safeParse(json.data);
        if (!cancelled && parsed.success) setFeed(parsed.data);
      } catch {
        // Leave the SSR feed in place — never blocks the pick loop.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div data-testid="stack-deck">
      <DeckQueue
        feed={feed}
        serverOffsetMs={serverOffsetMs}
        arm={arm}
        duoQueue={duoQueue}
        rivalHandle={rivalHandle}
      />
    </div>
  );
}

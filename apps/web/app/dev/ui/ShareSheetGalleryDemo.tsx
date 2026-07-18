'use client';

/**
 * Gallery demo for `ShareSheet` (WS8-T2, mirrors `ClaimSheetGalleryDemo`'s pattern). Uses a
 * fixture pick id that doesn't exist in this dev DB — the sheet's UI wiring (format toggle,
 * copy-link, open/close) is fully exercisable without a real render; `share-cards.spec.ts`
 * covers the copy-link path end-to-end (no DB dependency: minting a `?r=` token needs no
 * entity lookup, see `packages/core/src/share-token.ts`'s header comment). Download/Web-Share
 * against a REAL rendered card are covered by `test/integration/share-cards.test.ts` instead,
 * against real Postgres — see that file for the loss/busted-streak coverage the WS8-T2 AC calls
 * for explicitly.
 */
import { useState } from 'react';
import ShareSheet from '@/components/share/ShareSheet';

const FIXTURE_PICK_ID = '00000000-0000-7000-8000-000000000001';

export default function ShareSheetGalleryDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-side-a rounded px-4 py-2 text-sm font-semibold text-white"
      >
        Open share sheet
      </button>
      <ShareSheet
        kind="receipt"
        targetId={FIXTURE_PICK_ID}
        pagePath="/q/2026-07-19-world-cup-final"
        title="Will France win the final?"
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

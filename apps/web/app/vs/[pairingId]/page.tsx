import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NemesisMatchupCard } from '@/components/nemesis/NemesisMatchupCard';
import { appUrl } from '@/lib/app-url';
import { getPairingById, getProfileRef } from '@/lib/nemesis/mock-api';
import type { PairingSide } from '@/lib/nemesis/types';

/**
 * `/vs/[pairingId]` — the public nemesis matchup page (design doc §10.1 route table;
 * §19.3 WS7-T6 "matchup page" deliverable). ISR 30s, same as other public matchup-ish
 * pages (§10.1: "`/vs/[pairingId]` | ISR 30s | public matchup").
 *
 * INV-10 compliance: this server render is viewer-free by construction —
 * `NemesisMatchupCard` is called with `viewerProfileId={null}` here, always. There is no
 * client "viewer island" on this page (unlike `/q/[slug]`'s §10.2 pattern): the
 * rematch-request flow needs `claimed` auth and a real identity check (`GET /me`, not yet
 * implemented on this branch), so it lives entirely on the private `/nemesis` hub page
 * instead of being bolted onto this public, cache-shared route.
 *
 * SPEC-GAP(WS7-T6): backed by the mock API (`lib/nemesis/mock-api.ts`) pending WS5-T4
 * (`GET /pairings/:id`, design doc §9.2) — see that file's header for the full contract
 * explanation. `GET /profiles/:slug` (for each side's rating) is unbuilt too (owned by
 * WS7-T4/whoever ships it), also mocked here.
 *
 * SPEC-GAP(ws8-t4): the oEmbed discovery link below points at a real, DB-backed
 * `/api/oembed` (WS8-T4, `lib/oembed/response.ts`'s `loadMatchupOg` via `nemesis_pairings`),
 * but this page's `pairingId` is still a mock id (see the SPEC-GAP above) with no
 * corresponding real row — so the link legitimately 404s today, exactly like `/p/[slug]`'s
 * pre-WS8 og:image SPEC-GAP did before WS8-T1 landed. It'll resolve for free once WS5-T4
 * wires this page to real pairings; no further oEmbed-side change needed then.
 */
export const revalidate = 30;

interface PageProps {
  params: Promise<{ pairingId: string }>;
}

function fallbackSide(profileId: string, handle: string, slug: string): PairingSide {
  return { profile_id: profileId, handle, slug, rating: null };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { pairingId } = await params;
  const pairing = getPairingById(pairingId);
  if (!pairing) return { title: 'Matchup not found — Receipts' };
  const pageUrl = `${appUrl()}/vs/${pairingId}`;
  return {
    title: `${pairing.a.handle} vs ${pairing.b.handle} — Receipts`,
    description: `Nemesis matchup: ${pairing.a.handle} vs ${pairing.b.handle}, week of ${pairing.week_start}.`,
    alternates: {
      types: {
        'application/json+oembed': `${appUrl()}/api/oembed?url=${encodeURIComponent(pageUrl)}`,
      },
    },
  };
}

export default async function PairingPage({ params }: PageProps) {
  const { pairingId } = await params;
  const pairing = getPairingById(pairingId);
  if (!pairing) notFound();

  const aRef =
    getProfileRef(pairing.a.slug) ??
    fallbackSide(pairing.a.profile_id, pairing.a.handle, pairing.a.slug);
  const bRef =
    getProfileRef(pairing.b.slug) ??
    fallbackSide(pairing.b.profile_id, pairing.b.handle, pairing.b.slug);

  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <NemesisMatchupCard pairing={pairing} sides={{ a: aRef, b: bRef }} viewerProfileId={null} />
    </main>
  );
}

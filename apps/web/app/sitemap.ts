/**
 * `/sitemap.xml` (Next.js App Router file convention, design doc §10.5, §19.3 WS8-T4): lists
 * revealed questions + visible profiles. Query logic lives in `lib/sitemap.ts` (testable
 * without Next's metadata machinery); this file is the thin route-convention wrapper.
 *
 * `dynamic = 'force-dynamic'`: without it, Next tries to statically prerender this file at
 * `pnpm build` time (no dynamic path segment to defer on, unlike `/q/[slug]`'s ISR) — which
 * fails in CI's build step, since `pnpm build` runs with no `DATABASE_URL` configured (§17.3;
 * `.github/workflows/ci.yml`'s `verify` job only wires DB env vars into the later integration
 * job). Forcing dynamic rendering computes this per-request instead, same posture as
 * `/api/og/*`'s route handlers (`lib/og/route-handler.ts`).
 */
import type { MetadataRoute } from 'next';
import { buildSitemapEntries } from '@/lib/sitemap';
import { getDb } from '@/lib/stores';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSitemapEntries(getDb());
}

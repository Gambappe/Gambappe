/**
 * `app/sitemap.ts` service layer (design doc §10.5, §19.3 WS8-T4 AC: "sitemap lists revealed
 * questions + profiles"). Split out from the route-convention file so the query logic is
 * directly unit/integration-testable without going through Next's `MetadataRoute` machinery.
 */
import type { MetadataRoute } from 'next';
import {
  listRevealedQuestionsForSitemap,
  listVisibleProfilesForSitemap,
  type Db,
} from '@receipts/db';
import { appUrl } from '@/lib/app-url';

/**
 * A defensive cap per entity type, well under the sitemap protocol's 50,000-URL-per-file limit
 * (sitemaps.org / Google Search Central) — not a claim that today's volume is anywhere close to
 * it. At current volumes (~1 revealed daily question/day, a modest profile count) a single
 * `app/sitemap.ts` file is nowhere near this; if/when real volume approaches it, switch to
 * Next's `generateSitemaps()` multi-file convention instead of raising this constant further.
 * SPEC-GAP(ws8-t4): §10.5 doesn't specify a pagination/chunking scheme, so this cap (rather than
 * an unbounded query) is this task's own conservative choice.
 */
export const SITEMAP_ENTITY_CAP = 45_000;

export async function buildQuestionSitemapEntries(
  db: Db,
  offset = 0,
  limit = SITEMAP_ENTITY_CAP,
): Promise<MetadataRoute.Sitemap> {
  const rows = await listRevealedQuestionsForSitemap(db, limit, offset);
  const origin = appUrl();
  return rows.map((row) => ({
    url: `${origin}/q/${row.slug}`,
    lastModified: row.updatedAt,
    // A revealed question's page never changes again in any way a crawler cares about (§5.7:
    // `revealed` is terminal short of an admin void, which is rare/exceptional).
    changeFrequency: 'never' as const,
  }));
}

export async function buildProfileSitemapEntries(
  db: Db,
  offset = 0,
  limit = SITEMAP_ENTITY_CAP,
): Promise<MetadataRoute.Sitemap> {
  const rows = await listVisibleProfilesForSitemap(db, limit, offset);
  const origin = appUrl();
  return rows.map((row) => ({
    url: `${origin}/p/${row.slug}`,
    lastModified: row.updatedAt,
    // Picks/streaks/rating keep changing for an active profile.
    changeFrequency: 'daily' as const,
  }));
}

export async function buildSitemapEntries(db: Db): Promise<MetadataRoute.Sitemap> {
  const [questionEntries, profileEntries] = await Promise.all([
    buildQuestionSitemapEntries(db),
    buildProfileSitemapEntries(db),
  ]);
  return [...questionEntries, ...profileEntries];
}

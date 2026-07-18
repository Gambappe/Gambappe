/**
 * Profile repository helpers (WS0-T3 + WS2 additions). Business flows (mint/claim/merge) are
 * WS2 scope; these are the shared primitives they're built on. Additive only — WS0's original
 * exports are unchanged.
 */
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { Db } from '../client.js';
import { profiles } from '../schema/index.js';

export type ProfileRow = typeof profiles.$inferSelect;
export type NewProfileRow = typeof profiles.$inferInsert;

export async function insertProfile(db: Db, row: NewProfileRow): Promise<ProfileRow> {
  const [inserted] = await db.insert(profiles).values(row).returning();
  if (!inserted) throw new Error('insertProfile: no row returned');
  return inserted;
}

export async function getProfileById(db: Db, id: string): Promise<ProfileRow | null> {
  const [row] = await db.select().from(profiles).where(eq(profiles.id, id)).limit(1);
  return row ?? null;
}

export async function getProfileBySlug(db: Db, slug: string): Promise<ProfileRow | null> {
  const [row] = await db.select().from(profiles).where(eq(profiles.slug, slug)).limit(1);
  return row ?? null;
}

/** WS2-T3: resolve a claimed profile by its Auth.js `user_id` (§6.1.1 auth resolution). */
export async function getProfileByUserId(db: Db, userId: string): Promise<ProfileRow | null> {
  const [row] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  return row ?? null;
}

/**
 * WS2-T1/T4: case-insensitive handle collision check (used by the handle generator and
 * `PATCH /me/handle`). `excludeProfileId` lets a caller re-submit their own current handle
 * without tripping the collision check against themselves.
 */
export async function handleExists(
  db: Db,
  handle: string,
  excludeProfileId?: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(
      excludeProfileId
        ? and(sql`lower(${profiles.handle}) = lower(${handle})`, ne(profiles.id, excludeProfileId))
        : sql`lower(${profiles.handle}) = lower(${handle})`,
    )
    .limit(1);
  return row !== undefined;
}

/** WS2: generic partial update by id, returning the updated row. */
export async function updateProfileById(
  db: Db,
  id: string,
  patch: Partial<NewProfileRow>,
): Promise<ProfileRow> {
  const [updated] = await db
    .update(profiles)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(profiles.id, id))
    .returning();
  if (!updated) throw new Error(`updateProfileById: no row for id=${id}`);
  return updated;
}

/** Nightly bot-score write (§14.2, WS11-T2) — one transaction so a partial failure never
 * leaves last night's scores mixed with tonight's for some profiles but not others. */
export async function updateProfileBotScores(
  db: Db,
  scores: { profileId: string; score: number }[],
): Promise<void> {
  if (scores.length === 0) return;
  await db.transaction(async (tx) => {
    for (const { profileId, score } of scores) {
      await tx.update(profiles).set({ botScore: score, updatedAt: new Date() }).where(eq(profiles.id, profileId));
    }
  });
}

// --- §19.3 WS8-T4 sitemap ------------------------------------------------------------------

export interface SitemapProfileRow {
  slug: string;
  updatedAt: Date;
}

/** Every profile `/p/[slug]` (`apps/web/lib/profile-page.ts`'s `getVisibleProfileBySlug`) would
 * 200 for — same `status !== 'deleted'` rule, exactly — slug-ordered for stable offset
 * pagination. The "profiles" half of the §10.5/§19.3 WS8-T4 sitemap AC. */
export async function listVisibleProfilesForSitemap(
  db: Db,
  limit: number,
  offset: number,
): Promise<SitemapProfileRow[]> {
  return db
    .select({ slug: profiles.slug, updatedAt: profiles.updatedAt })
    .from(profiles)
    .where(ne(profiles.status, 'deleted'))
    .orderBy(asc(profiles.slug))
    .limit(limit)
    .offset(offset);
}

export async function countVisibleProfilesForSitemap(db: Db): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(profiles)
    .where(ne(profiles.status, 'deleted'));
  return row?.count ?? 0;
}

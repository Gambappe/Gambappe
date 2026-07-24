import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { connect, profiles, sessions, users } from '@receipts/db';

const slug = process.argv[2];
if (!slug) throw new Error('usage: tsx mint-demo-session.mts <profile-slug>');

const { pool, db } = connect();
const userId = randomUUID();
await db.insert(users).values({
  id: userId,
  email: `demo-${slug}-${randomUUID()}@example.test`,
  ageAttestedAt: new Date(),
});
await db.update(profiles).set({ userId }).where(eq(profiles.slug, slug));
const sessionToken = randomUUID();
await db.insert(sessions).values({ sessionToken, userId, expires: new Date(Date.now() + 30 * 86_400_000) });
console.log(sessionToken);
await pool.end();

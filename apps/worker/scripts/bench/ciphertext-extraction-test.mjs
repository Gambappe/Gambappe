/**
 * The tradeoff, tested directly: if xTrace cannot decrypt the content, can it still extract?
 * Encrypt real confessions with AES-256-GCM (the scheme Confit specifies), ingest the ciphertext
 * as message content, and see what extraction produces.
 *
 * Control lane: the same confessions in plaintext, so the comparison is like-for-like.
 */
import { createCipheriv, randomBytes, scryptSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const apiKey = process.env.XTRACE_API_KEY;
const base = process.env.XTRACE_API_BASE || 'https://api.production.xtrace.ai';
const appId = process.env.XTRACE_APP_ID;
const OUT = '/tmp/claude-0/-home-user-Gambappe/318c540c-00ed-5b31-a2f4-340577435dd8/scratchpad';
const RUN = Math.random().toString(36).slice(2, 8);

const CONFESSIONS = [
  "I can't handle spice at all. I've been pretending I can for about a decade because of my brother.",
  "I only ever go to Rosa's for the nine pound lunch. The dinner menu is a robbery for identical food.",
  "I order off the children's menu at the mall branch. The adult portions defeat me and I'm tired of the look.",
  "I go alone to Ha's on Tuesdays because the bartender remembers my name and starts my order.",
  "We broke up at Bellwether. The kitchen is genuinely excellent. I will never set foot in it again.",
  "I'm on a GLP-1 and almost everything tastes wrong now, except the tom yum at Ha's.",
];

// AES-256-GCM, key from a passphrase — exactly the scheme in the build spec.
const key = scryptSync('a-passphrase-only-the-user-knows', 'confit-salt', 32);
function encrypt(plain) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}

async function ingest(userId, convId, contents) {
  const res = await fetch(`${base}/v1/memories`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({
      messages: contents.map((content) => ({
        role: 'user', content, date: new Date(Date.UTC(2026, 5, 10, 12)).toISOString(),
      })),
      user_id: userId, conv_id: convId, app_id: appId, group_ids: [], agent_id: null,
    }),
  });
  return res.status;
}

const users = {
  cipher: `enc:${RUN}:cipher`,
  plain: `enc:${RUN}:plain`,
};

const ciphertexts = CONFESSIONS.map(encrypt);
console.log('sample ciphertext (what xTrace would receive):');
console.log('  ' + ciphertexts[0].slice(0, 96) + '...\n');

console.log('cipher lane:', await ingest(users.cipher, `enc:${RUN}:cipher:1`, ciphertexts));
console.log('plain  lane:', await ingest(users.plain, `enc:${RUN}:plain:1`, CONFESSIONS));

writeFileSync(`${OUT}/enc-state.json`, JSON.stringify({ run: RUN, users, ciphertexts }));
console.log(`\nRUN=${RUN} — settle, then query both lanes`);

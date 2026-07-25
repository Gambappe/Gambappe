/**
 * Does the xTrace API actually expose the encrypted-vector / homomorphic-search surface Confit
 * declares as its uncuttable dependency? Probe for it directly.
 *
 * Bound on the conclusion: absence on this REST base URL does not prove the capability does not
 * exist — it could be SDK-only, a different host, or access-gated. What it does establish is
 * whether the team can reach it with the credentials they'll have on the day.
 */
const apiKey = process.env.XTRACE_API_KEY;
const base = process.env.XTRACE_API_BASE || 'https://api.production.xtrace.ai';
const appId = process.env.XTRACE_APP_ID;

async function probe(method, path, body) {
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    return { status: res.status, snippet: text.slice(0, 220).replace(/\n/g, ' ') };
  } catch (e) {
    return { status: 'ERR', snippet: String(e).slice(0, 120) };
  }
}

console.log('=== 1. spec / discovery endpoints ===');
for (const p of ['/openapi.json', '/v1/openapi.json', '/docs', '/v1', '/', '/v1/routes', '/.well-known/openapi.json']) {
  const r = await probe('GET', p);
  console.log(`  GET ${p.padEnd(30)} ${r.status}  ${r.snippet.slice(0, 110)}`);
}

console.log('\n=== 2. plausible encrypted-vector endpoints ===');
const CANDIDATES = [
  '/v1/x-vec', '/v1/xvec', '/v1/x_vec', '/v1/vectors', '/v1/vectors/search',
  '/v1/encrypted', '/v1/encrypted/search', '/v1/memories/vector-search',
  '/v1/embeddings', '/v1/secure/search', '/v1/he/search', '/v1/pool', '/v1/lessons',
];
for (const p of CANDIDATES) {
  const g = await probe('GET', p);
  const po = await probe('POST', p, { app_id: appId });
  console.log(`  ${p.padEnd(30)} GET ${String(g.status).padEnd(4)} POST ${String(po.status).padEnd(4)} ${po.snippet.slice(0, 90)}`);
}

console.log('\n=== 3. does /v1/memories/search accept a precomputed VECTOR instead of text? ===');
const vec = Array.from({ length: 384 }, (_, i) => Math.sin(i) / 10);
for (const key of ['vector', 'embedding', 'query_vector', 'query_embedding', 'encrypted_vector']) {
  const r = await probe('POST', '/v1/memories/search', {
    [key]: vec, mode: 'retrieve', app_id: appId, user_id: null, group_ids: [], include: ['fact'],
  });
  console.log(`  field=${key.padEnd(18)} ${r.status}  ${r.snippet.slice(0, 150)}`);
}

console.log('\n=== 4. does ingest accept a precomputed vector / ciphertext field? ===');
for (const body of [
  { label: 'vector on message', payload: { messages: [{ role: 'user', content: 'x', vector: vec }], user_id: 'enc-probe', conv_id: 'enc-1', app_id: appId } },
  { label: 'top-level vector', payload: { messages: [{ role: 'user', content: 'x' }], vector: vec, user_id: 'enc-probe', conv_id: 'enc-2', app_id: appId } },
  { label: 'ciphertext field', payload: { messages: [{ role: 'user', content: 'x' }], ciphertext: 'BASE64==', user_id: 'enc-probe', conv_id: 'enc-3', app_id: appId } },
  { label: 'encrypted:true flag', payload: { messages: [{ role: 'user', content: 'x' }], encrypted: true, user_id: 'enc-probe', conv_id: 'enc-4', app_id: appId } },
]) {
  const r = await probe('POST', '/v1/memories', body.payload);
  console.log(`  ${body.label.padEnd(20)} ${r.status}  ${r.snippet.slice(0, 140)}`);
}

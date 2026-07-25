"""
pgvector semantic-search lane for the betting stress corpus, to sit alongside the xTrace lanes.

The v1-v6 baseline was Postgres FTS -- lexical only, so it never tested semantic retrieval. This
indexes the SAME 159 messages from stress_fts with real sentence embeddings
(BAAI/bge-small-en-v1.5, 384-dim) and answers the SAME 10 queries at the same top-k.

Two granularities, mirroring what each system was actually fed:
  msg   -- one row per message (159), the granularity FTS indexed
  batch -- one row per author-week conversation (16), the granularity xTrace ingested

Writes a lane-keyed JSON so the existing marker scorer grades it with identical rules.
"""
import os, json, time, psycopg2
from fastembed import TextEmbedding

RUN = os.environ.get('STRESS_RUN', 'mryar6gy')
TOP_K = 5
DSN = os.environ.get('DATABASE_URL', 'postgres://receipts:receipts@localhost:5432/receipts')
OUT = os.environ.get('BENCH_OUT', '/tmp/claude-0/-home-user-Gambappe/318c540c-00ed-5b31-a2f4-340577435dd8/scratchpad')

QUERIES = [
    ('Q1', 'T1', 'who won the rematch'),
    ('Q2', 'T1', 'did the parlay hit'),
    ('Q3', 'T1', 'what were the callout stakes'),
    ('Q4', 'T2', 'biggest blowout defeat'),
    ('Q5', 'T2', 'which day of the week does mo usually lose on'),
    ('Q6', 'T2', 'longest winning streak'),
    ('Q7', 'T3', 'is anyone on a losing streak against their rival'),
    ('Q8', 'T3', "what is mo's current betting strategy"),
    ('Q9', 'T3', 'are their weekly matchups usually close'),
    ('Q10', 'T3', 'how long have dex and mo been rivals'),
]

model = TextEmbedding('BAAI/bge-small-en-v1.5')
def embed(texts):
    return [v.tolist() for v in model.embed(list(texts))]

conn = psycopg2.connect(DSN); conn.autocommit = True
cur = conn.cursor()

cur.execute("SELECT author, week, body FROM stress_fts WHERE run_id = %s ORDER BY week, author", (RUN,))
rows = cur.fetchall()
print(f"corpus: {len(rows)} messages for run {RUN}")

# msg granularity
msgs = [(a, w, b, f"{a}: {b}") for a, w, b in rows]
# batch granularity: concatenate each author-week, exactly as xTrace's ingest batched them
batches = {}
for a, w, b in rows:
    batches.setdefault((a, w), []).append(b)
batch_rows = [(a, w, "\n".join(bs), f"{a} week {w}:\n" + "\n".join(bs)) for (a, w), bs in sorted(batches.items())]
print(f"batches: {len(batch_rows)} author-week conversations")

cur.execute("DROP TABLE IF EXISTS bet_msg; DROP TABLE IF EXISTS bet_batch;")
cur.execute("CREATE TABLE bet_msg (id serial primary key, author text, week int, body text, emb vector(384));")
cur.execute("CREATE TABLE bet_batch (id serial primary key, author text, week int, body text, emb vector(384));")

for (a, w, b, t), v in zip(msgs, embed([m[3] for m in msgs])):
    cur.execute("INSERT INTO bet_msg (author, week, body, emb) VALUES (%s,%s,%s,%s)", (a, w, b, str(v)))
for (a, w, b, t), v in zip(batch_rows, embed([m[3] for m in batch_rows])):
    cur.execute("INSERT INTO bet_batch (author, week, body, emb) VALUES (%s,%s,%s,%s)", (a, w, b, str(v)))

lanes = {}
lat = []
for table, lane in (('bet_msg', 'pgvector-msg'), ('bet_batch', 'pgvector-batch')):
    per_query = {}
    for qid, tier, q in QUERIES:
        qv = embed([q])[0]
        t0 = time.perf_counter()
        cur.execute(
            f"SELECT author, body, 1 - (emb <=> %s::vector) AS sim FROM {table} "
            f"ORDER BY emb <=> %s::vector LIMIT {TOP_K}", (str(qv), str(qv)))
        got = cur.fetchall()
        lat.append((time.perf_counter() - t0) * 1000)
        per_query[qid] = [f"{a}: {b}" for a, b, _ in got]
    lanes[lane] = per_query
    print(f"\n=== {lane} ===")
    for qid, tier, q in QUERIES:
        print(f"  {qid} ({tier}) \"{q}\"")
        for i, t in enumerate(per_query[qid], 1):
            print(f"     {i}. {t[:110]}")

json.dump(lanes, open(f"{OUT}/betting-pgvector-results.json", "w"), indent=2)
print(f"\nmean SQL query latency: {sum(lat)/len(lat):.1f}ms")
print(f"wrote {OUT}/betting-pgvector-results.json")

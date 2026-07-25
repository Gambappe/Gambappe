"""
pgvector lane for the food supersession test. Same corpus, two granularities (per-order and
per-month batch), real embeddings, cosine ranking. Writes a lane-keyed JSON for the shared judge.

Recency is the obvious objection to this comparison, so this also runs a THIRD lane that gives
SQL every advantage: recency-weighted ranking (cosine similarity blended with how recent the
record is). If plain semantic search reports the stale preference, the fair question is whether a
competent engineer could fix it cheaply in SQL — so this measures that too.
"""
import os, json, subprocess, psycopg2
from fastembed import TextEmbedding

DSN = os.environ.get('DATABASE_URL', 'postgres://receipts:receipts@localhost:5432/receipts')
OUT = os.environ.get('BENCH_OUT', '/tmp/claude-0/-home-user-Gambappe/318c540c-00ed-5b31-a2f4-340577435dd8/scratchpad')
HERE = os.path.dirname(os.path.abspath(__file__))
TOP_K = 5

# Pull the corpus out of the shared JS module so both systems provably use identical text.
dump = subprocess.run(
    ['node', '-e', f"""
import('{HERE}/food-corpus.mjs').then((m) => {{
  console.log(JSON.stringify({{ orders: m.ORDERS, probes: m.PROBES.map((p) => ({{ id: p.id, query: p.query }})) }}));
}});
"""], capture_output=True, text=True, check=True)
data = json.loads(dump.stdout)
ORDERS, PROBES = data['orders'], data['probes']
print(f"corpus: {len(ORDERS)} orders, {len(PROBES)} probes")

model = TextEmbedding('BAAI/bge-small-en-v1.5')
def embed(texts):
    return [v.tolist() for v in model.embed(list(texts))]

conn = psycopg2.connect(DSN); conn.autocommit = True
cur = conn.cursor()
cur.execute("DROP TABLE IF EXISTS food_order; DROP TABLE IF EXISTS food_month;")
cur.execute("CREATE TABLE food_order (id serial primary key, month int, text text, emb vector(384));")
cur.execute("CREATE TABLE food_month (id serial primary key, month int, text text, emb vector(384));")

for o, v in zip(ORDERS, embed([o['text'] for o in ORDERS])):
    cur.execute("INSERT INTO food_order (month, text, emb) VALUES (%s,%s,%s)", (o['month'], o['text'], str(v)))

months = {}
for o in ORDERS:
    months.setdefault(o['month'], []).append(o['text'])
month_rows = [(m, "\n".join(ts)) for m, ts in sorted(months.items())]
for (m, t), v in zip(month_rows, embed([t for _, t in month_rows])):
    cur.execute("INSERT INTO food_month (month, text, emb) VALUES (%s,%s,%s)", (m, t, str(v)))

print(f"indexed {len(ORDERS)} orders, {len(month_rows)} monthly batches")

lanes = {}
qvecs = {p['id']: embed([p['query']])[0] for p in PROBES}

for table, lane in (('food_order', 'pgvector-order'), ('food_month', 'pgvector-month')):
    per = {}
    for p in PROBES:
        qv = qvecs[p['id']]
        cur.execute(
            f"SELECT month, text FROM {table} ORDER BY emb <=> %s::vector LIMIT {TOP_K}", (str(qv),))
        per[p['id']] = [f"[month {m}] {t}" for m, t in cur.fetchall()]
    lanes[lane] = per

# Recency-weighted lane: give SQL the benefit of the doubt. score = cosine + 0.06 * month
for p in PROBES:
    qv = qvecs[p['id']]
    cur.execute(
        "SELECT month, text FROM food_order "
        "ORDER BY (1 - (emb <=> %s::vector)) + 0.06 * month DESC LIMIT %s", (str(qv), TOP_K))
    lanes.setdefault('pgvector-recency', {})[p['id']] = [f"[month {m}] {t}" for m, t in cur.fetchall()]

json.dump(lanes, open(f"{OUT}/food-pgvector-results.json", "w"), indent=2)
for lane, per in lanes.items():
    print(f"\n===== {lane}")
    for p in PROBES:
        print(f"  [{p['id']}] {p['query']}")
        for i, t in enumerate(per[p['id']], 1):
            print(f"     {i}. {t[:120]}")
print(f"\nwrote {OUT}/food-pgvector-results.json")

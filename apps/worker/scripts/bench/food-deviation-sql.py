"""
pgvector lanes for the deviation test. Ground truth: this person still avoids dairy. One recent
birthday exception should not flip the answer.

Recency weighting fixed supersession in the previous test, so the question here is whether it
overcorrects — treating one recent anomaly as a new preference.
"""
import os, json, subprocess, psycopg2
from fastembed import TextEmbedding

DSN = os.environ.get('DATABASE_URL', 'postgres://receipts:receipts@localhost:5432/receipts')
OUT = os.environ.get('BENCH_OUT', '/tmp/claude-0/-home-user-Gambappe/318c540c-00ed-5b31-a2f4-340577435dd8/scratchpad')
HERE = os.path.dirname(os.path.abspath(__file__))
TOP_K = 5

dump = subprocess.run(['node', '-e', f"""
import('{HERE}/food-corpus.mjs').then((m) => {{
  const out = {{ probe: m.DEVIATION_PROBE.query, variants: {{}} }};
  for (const v of Object.keys(m.DEVIATIONS)) out.variants[v] = m.ordersWith(v);
  console.log(JSON.stringify(out));
}});
"""], capture_output=True, text=True, check=True)
data = json.loads(dump.stdout)
QUERY = data['probe']

model = TextEmbedding('BAAI/bge-small-en-v1.5')
def embed(texts):
    return [v.tolist() for v in model.embed(list(texts))]

conn = psycopg2.connect(DSN); conn.autocommit = True
cur = conn.cursor()
qv = embed([QUERY])[0]

lanes = {}
for variant, orders in data['variants'].items():
    t = f"dev_{variant}"
    cur.execute(f"DROP TABLE IF EXISTS {t};")
    cur.execute(f"CREATE TABLE {t} (id serial primary key, month int, text text, emb vector(384));")
    for o, v in zip(orders, embed([o['text'] for o in orders])):
        cur.execute(f"INSERT INTO {t} (month, text, emb) VALUES (%s,%s,%s)", (o['month'], o['text'], str(v)))

    cur.execute(f"SELECT month, text FROM {t} ORDER BY emb <=> %s::vector LIMIT {TOP_K}", (str(qv),))
    lanes.setdefault('pgvector-plain', {})[variant] = [f"[month {m}] {x}" for m, x in cur.fetchall()]

    cur.execute(
        f"SELECT month, text FROM {t} ORDER BY (1 - (emb <=> %s::vector)) + 0.06 * month DESC LIMIT {TOP_K}",
        (str(qv),))
    lanes.setdefault('pgvector-recency', {})[variant] = [f"[month {m}] {x}" for m, x in cur.fetchall()]

json.dump(lanes, open(f"{OUT}/food-deviation-pgvector.json", "w"), indent=2)
for lane, per in lanes.items():
    print(f"\n===== {lane}")
    for variant, items in per.items():
        print(f"  --- {variant}")
        for i, x in enumerate(items, 1):
            print(f"     {i}. {x[:125]}")
print(f"\nwrote {OUT}/food-deviation-pgvector.json")

"""
pgvector lanes for the Confit test: the same corpus embedded as prose and as stripped lessons.
Together with the two xTrace lanes this separates representation from substrate.
"""
import os, json, subprocess, psycopg2
from fastembed import TextEmbedding

DSN = os.environ.get('DATABASE_URL', 'postgres://receipts:receipts@localhost:5432/receipts')
OUT = os.environ.get('BENCH_OUT', '/tmp/claude-0/-home-user-Gambappe/318c540c-00ed-5b31-a2f4-340577435dd8/scratchpad')
HERE = os.path.dirname(os.path.abspath(__file__))
TOP_K = int(os.environ.get("TOP_K", "5"))

dump = subprocess.run(['node', '-e', f"""
import('{HERE}/confit-corpus.mjs').then((m) => console.log(JSON.stringify({{
  rows: m.CONFESSIONS.map((c) => ({{ month: c.month, prose: c.text, lesson: m.lessonText(c) }})),
  probes: m.PROBES.map((p) => ({{ id: p.id, query: p.query }})),
}})));
"""], capture_output=True, text=True, check=True)
d = json.loads(dump.stdout)
rows, probes = d['rows'], d['probes']
print(f"corpus: {len(rows)} confessions, {len(probes)} probes")

model = TextEmbedding('BAAI/bge-small-en-v1.5')
emb = lambda ts: [v.tolist() for v in model.embed(list(ts))]

conn = psycopg2.connect(DSN); conn.autocommit = True
cur = conn.cursor()

lanes = {}
for field, lane, table in (('prose', 'pgvector-prose', 'confit_prose'),
                           ('lesson', 'pgvector-lesson', 'confit_lesson')):
    cur.execute(f"DROP TABLE IF EXISTS {table};")
    cur.execute(f"CREATE TABLE {table} (id serial primary key, month int, text text, emb vector(384));")
    texts = [r[field] for r in rows]
    for r, v in zip(rows, emb(texts)):
        cur.execute(f"INSERT INTO {table} (month, text, emb) VALUES (%s,%s,%s)", (r['month'], r[field], str(v)))
    per = {}
    for p in probes:
        qv = emb([p['query']])[0]
        # Recency-weighted, which was the configuration that beat plain similarity on supersession.
        cur.execute(
            f"SELECT month, text FROM {table} "
            f"ORDER BY (1 - (emb <=> %s::vector)) + 0.03 * month DESC LIMIT {TOP_K}", (str(qv),))
        per[p['id']] = [f"[m{m}] {t}" for m, t in cur.fetchall()]
    lanes[lane] = per
    print(f"{lane}: indexed {len(rows)}")

json.dump(lanes, open(f"{OUT}/confit-pgvector.json", "w"), indent=2)
print(f"wrote {OUT}/confit-pgvector.json")

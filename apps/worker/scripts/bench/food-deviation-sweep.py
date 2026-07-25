"""
How sensitive is the recency-weighting fix to its constant? Sweep the weight and report, for each
value, whether the top-5 is still dominated by dairy-free evidence or has been taken over by the
single recent exception.
"""
import os, re, json, subprocess, psycopg2
from fastembed import TextEmbedding

DSN = os.environ.get('DATABASE_URL', 'postgres://receipts:receipts@localhost:5432/receipts')
HERE = os.path.dirname(os.path.abspath(__file__))
FREE_RE = re.compile(r"dairy[- ]free|off dairy|oat milk|no cheese|avoid(s|ing)? dairy|without cream|stopped .*dairy|coconut (yoghurt|milk)|not a phase|no dairy", re.I)
DEV_RE = re.compile(r"cheesecake", re.I)

dump = subprocess.run(['node', '-e', f"""
import('{HERE}/food-corpus.mjs').then((m) => console.log(JSON.stringify({{
  query: m.DEVIATION_PROBE.query, orders: m.ordersWith('neutral'),
}})));
"""], capture_output=True, text=True, check=True)
d = json.loads(dump.stdout)

model = TextEmbedding('BAAI/bge-small-en-v1.5')
qv = list(model.embed([d['query']]))[0].tolist()

conn = psycopg2.connect(DSN); conn.autocommit = True
cur = conn.cursor()
cur.execute("SELECT count(*) FROM information_schema.tables WHERE table_name='dev_neutral'")
if cur.fetchone()[0] == 0:
    raise SystemExit("dev_neutral missing — run food-deviation-sql.py first")

print(f"{'weight':>8} {'free/5':>7} {'dev rank':>9}  verdict")
for w in (0.0, 0.02, 0.04, 0.06, 0.08, 0.10, 0.15, 0.20, 0.30):
    cur.execute(
        "SELECT month, text FROM dev_neutral "
        "ORDER BY (1 - (emb <=> %s::vector)) + %s * month DESC LIMIT 5", (str(qv), w))
    rows = cur.fetchall()
    texts = [t for _, t in rows]
    free = sum(1 for t in texts if FREE_RE.search(t))
    dev = next((i + 1 for i, t in enumerate(texts) if DEV_RE.search(t)), None)
    verdict = 'FLIPPED' if free == 0 else ('at-risk' if free <= 1 else 'robust')
    print(f"{w:>8.2f} {free:>7} {str(dev):>9}  {verdict}")

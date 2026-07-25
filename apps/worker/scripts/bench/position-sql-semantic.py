"""
SQL semantic-search baseline for the per-move commentary use case, head-to-head with xTrace.

Same 16 decision points, same 4 fresh probe positions, same precision@5 metric. Difference is
the machinery: real sentence embeddings (BAAI/bge-small-en-v1.5, 384-dim) stored in pgvector and
ranked by cosine distance, versus xTrace's extract-then-search pipeline.

Two retrieval granularities are measured, because they answer different questions:
  doc   — embed the whole decision-point review (what you'd build by default)
  chunk — embed each sentence separately (finer-grained, usually better precision)
"""
import os, re, json, psycopg2
from fastembed import TextEmbedding

DIR = '/tmp/claude-0/-home-user-Gambappe/318c540c-00ed-5b31-a2f4-340577435dd8/scratchpad'
DSN = os.environ.get('DATABASE_URL', 'postgres://receipts:receipts@localhost:5432/receipts')

# Identical corpus to position-ingest.mjs (archetype, header, body).
DECISIONS = [
    ('iqp', 'vs Ferrant, 2026-02-07', "Kestrel reached a middlegame holding an isolated queen's pawn on d4 with active pieces and a half-open e-file. With the initiative available, Kestrel offered a queen trade on d1 anyway. The trade removed the attacking chances the isolated pawn was supposed to pay for, and the pawn became a static weakness. Kestrel lost the endgame on move 48."),
    ('iqp', 'vs Baltus, 2026-02-21', "Another isolated queen's pawn middlegame for Kestrel, this time with both bishops pointing at the kingside. Kestrel again steered into a queen exchange rather than playing for the attack. Without queens the isolated d-pawn was simply weak, and Kestrel spent forty moves defending it before conceding a draw."),
    ('iqp', 'vs Nowicki, 2026-03-14', "Kestrel took on an isolated queen's pawn structure out of the opening and had a clear kingside attacking setup. At the critical moment Kestrel traded queens once more. The resulting endgame was joyless defence and Kestrel lost the isolated pawn on move 39."),
    ('iqp', 'vs Ostrowska, 2026-04-02', "Isolated queen's pawn position again for Kestrel with a strong outpost. Kestrel repeated the pattern and exchanged queens at the first opportunity, converting a dynamic position into a passive one. Drawn after long defence."),
    ('opposite', 'vs Halvard, 2026-02-11', "Opposite-side castling: Kestrel castled queenside, opponent kingside. Kestrel threw the h-pawn up the board immediately, ignoring development niceties, and opened the h-file first. The attack landed and Kestrel won on move 27."),
    ('opposite', 'vs Sandoval, 2026-03-01', "Another opposite-castling race. Kestrel started the pawn storm on move 12, before completing development, and got the g- and h-pawns rolling ahead of the opponent's queenside play. Kestrel broke through first and won on move 31."),
    ('opposite', 'vs Weiss, 2026-03-22', "Kings castled on opposite wings. Kestrel again prioritised speed over structure, pushing the h-pawn and sacrificing a pawn to rip open the file. The opponent was one tempo short and Kestrel converted on move 29."),
    ('opposite', 'vs Duarte, 2026-04-18', "Opposite-side castling with mutual attacks. Kestrel launched the flank pawns immediately and did not stop to defend, winning the race by a single move on move 34."),
    ('rook', 'vs Kowalczyk, 2026-01-30', "Rook endgame a pawn down. The active defence was available with the rook going behind the passed pawn, but Kestrel put the rook on the back rank and defended passively. The passive setup lost by zugzwang on move 61."),
    ('rook', 'vs Iverson, 2026-02-25', "Another rook ending a pawn down for Kestrel. Rather than activating the rook and counterattacking the queenside pawns, Kestrel again chose passive defence along the first rank and slowly got squeezed, losing on move 58."),
    ('rook', 'vs Marchetti, 2026-03-19', "Rook endgame, level material but a worse structure. Kestrel declined to activate the rook, kept it tied to defending a pawn, and drifted into a lost position by move 55."),
    ('rook', 'vs Aubert, 2026-04-11', "Rook ending a pawn down where the drawing method required immediate rook activity. Kestrel defended passively once more and only escaped with a draw because the opponent erred on move 63."),
    ('closed', 'vs Petrenko, 2026-02-03', "A completely closed position with a locked pawn chain and no immediate breaks. Kestrel declined to prepare either pawn break, shuffled the pieces between the back two ranks, and offered a draw on move 30."),
    ('closed', 'vs Lindqvist, 2026-03-07', "Closed centre, manoeuvring game. Kestrel had the option of a queenside break but avoided committing to it, repeated moves instead, and the game was drawn by repetition on move 28."),
    ('closed', 'vs Ferreira, 2026-03-28', "Another blocked structure where the plan required a slow buildup and a pawn break. Kestrel showed no appetite for it, manoeuvred without a plan, and agreed a draw on move 33."),
    ('closed', 'vs Tanaka, 2026-04-25', "Closed position with chances for both sides if either committed. Kestrel kept everything on the back ranks, refused the break, and drew on move 26."),
]

PROBES = [
    ('iqp', "White has an isolated queen's pawn on d4 in the middlegame with active pieces; a queen trade is available right now."),
    ('opposite', "The kings are castled on opposite wings and both sides have flank pawns ready to storm; who gets there first?"),
    ('rook', "A rook endgame a pawn down: should the rook stay back and defend, or activate and counterattack?"),
    ('closed', "A completely closed centre with locked pawn chains and no pawn break played yet; slow manoeuvring position."),
]

model = TextEmbedding('BAAI/bge-small-en-v1.5')
def embed(texts):
    return [v.tolist() for v in model.embed(list(texts))]

conn = psycopg2.connect(DSN); conn.autocommit = True
cur = conn.cursor()
cur.execute("DROP TABLE IF EXISTS pos_doc; DROP TABLE IF EXISTS pos_chunk;")
cur.execute("CREATE TABLE pos_doc (id serial primary key, arch text, header text, body text, emb vector(384));")
cur.execute("CREATE TABLE pos_chunk (id serial primary key, arch text, header text, sent text, emb vector(384));")

# doc-level
docs = [f"{h}. {b}" for _, h, b in DECISIONS]
for (arch, header, body), v in zip(DECISIONS, embed(docs)):
    cur.execute("INSERT INTO pos_doc (arch, header, body, emb) VALUES (%s,%s,%s,%s)", (arch, header, body, str(v)))

# sentence-level
chunks = []
for arch, header, body in DECISIONS:
    for s in re.split(r'(?<=\.)\s+', body):
        if len(s.strip()) > 25:
            chunks.append((arch, header, s.strip()))
for (arch, header, sent), v in zip(chunks, embed([c[2] for c in chunks])):
    cur.execute("INSERT INTO pos_chunk (arch, header, sent, emb) VALUES (%s,%s,%s,%s)", (arch, header, sent, str(v)))

cur.execute("SELECT count(*) FROM pos_doc"); ndoc = cur.fetchone()[0]
cur.execute("SELECT count(*) FROM pos_chunk"); nch = cur.fetchone()[0]
print(f"indexed {ndoc} docs, {nch} sentence chunks (384-dim, pgvector cosine)\n")

probe_vecs = embed([p for _, p in PROBES])
results = {}
for table, textcol in (('pos_doc', 'body'), ('pos_chunk', 'sent')):
    print("=" * 78); print(f"TABLE: {table}"); print("=" * 78)
    tot = 0.0
    for (arch, probe), qv in zip(PROBES, probe_vecs):
        cur.execute(
            f"SELECT arch, header, {textcol}, 1 - (emb <=> %s::vector) AS sim "
            f"FROM {table} ORDER BY emb <=> %s::vector LIMIT 5", (str(qv), str(qv)))
        rows = cur.fetchall()
        correct = sum(1 for r in rows if r[0] == arch)
        p5 = correct / len(rows) if rows else 0.0
        tot += p5
        print(f"\n[{arch}] precision@5={p5:.2f}")
        for i, (a, h, t, sim) in enumerate(rows, 1):
            print(f"   {i}. ({a}) sim={sim:.3f} {t[:105]}")
        results.setdefault(table, {})[arch] = p5
    print(f"\nMEAN precision@5 ({table}): {tot/len(PROBES):.2f}   [base rate 0.25]\n")

# Latency, same shape as the xTrace measurement.
import time
lat = []
for qv in probe_vecs:
    t0 = time.perf_counter()
    cur.execute("SELECT arch FROM pos_chunk ORDER BY emb <=> %s::vector LIMIT 5", (str(qv),))
    cur.fetchall()
    lat.append((time.perf_counter() - t0) * 1000)
print(f"SQL query latency (embedding already computed): mean {sum(lat)/len(lat):.1f}ms")

t0 = time.perf_counter(); embed(["a fresh position description for timing"]); enc = (time.perf_counter()-t0)*1000
print(f"local embedding of one probe: {enc:.0f}ms  -> end-to-end ~{enc + sum(lat)/len(lat):.0f}ms")

json.dump(results, open(f"{DIR}/sql-semantic-results.json", "w"), indent=2)

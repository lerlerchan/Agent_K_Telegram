#!/usr/bin/env python3
"""
Vault Semantic Search
Hybrid search (70% vector + 30% keyword) over ObsidianVault .md files.
Index stored in SQLite at ~/.local/share/vault-search/index.db

Usage:
  python3 vault-search.py "your query"            # search
  python3 vault-search.py --reindex               # force full reindex
  python3 vault-search.py --reindex "your query"  # reindex then search

PYTHON: /home/lerler/github/Agent_K_Telegram/.venv-search/bin/python
"""

import os
import re
import sys
import math
import json
import sqlite3
import hashlib
import argparse
from pathlib import Path

VAULT      = Path('/home/lerler/ObsidianVault')
DB_PATH    = Path.home() / '.local/share/vault-search/index.db'
TOP_N      = 8
SKIP_DIRS  = {'.obsidian', '.claude', 'graphify-out', 'raw', 'outputs', 'output', '.stfolder'}

# ─── Embedding model ──────────────────────────────────────────────────────────
# BAAI/bge-small-en-v1.5: 66MB ONNX, no API key, fast CPU inference
MODEL_NAME = 'BAAI/bge-small-en-v1.5'

def get_embedder():
    from fastembed import TextEmbedding
    return TextEmbedding(model_name=MODEL_NAME)

# ─── DB setup ─────────────────────────────────────────────────────────────────

def open_db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(DB_PATH))
    con.execute('''CREATE TABLE IF NOT EXISTS docs (
        path      TEXT PRIMARY KEY,
        mtime     REAL,
        md5       TEXT,
        title     TEXT,
        body      TEXT,
        tags      TEXT,
        embedding BLOB
    )''')
    con.execute('CREATE INDEX IF NOT EXISTS idx_path ON docs(path)')
    con.commit()
    return con

# ─── Vault walker ─────────────────────────────────────────────────────────────

def walk_vault():
    for root, dirs, files in os.walk(VAULT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.startswith('.')]
        for f in files:
            if f.endswith('.md'):
                yield Path(root) / f

# ─── Frontmatter helpers ──────────────────────────────────────────────────────

def parse_note(path: Path):
    text = path.read_text(errors='ignore')
    fm, body = {}, text
    m = re.match(r'^---\n(.*?)\n---\n?(.*)', text, re.DOTALL)
    if m:
        for line in m.group(1).splitlines():
            kv = line.split(':', 1)
            if len(kv) == 2:
                fm[kv[0].strip()] = kv[1].strip().strip('"')
        body = m.group(2)
    title = fm.get('title') or path.stem.replace('-', ' ')
    tags  = fm.get('tags', '')
    # Strip markdown syntax for cleaner embedding text
    clean = re.sub(r'[#*`\[\]>|]', '', body).strip()
    return title, tags, clean[:4000]  # cap at 4000 chars for speed

# ─── Indexing ─────────────────────────────────────────────────────────────────

def embed_texts(embedder, texts: list[str]) -> list[bytes]:
    import numpy as np
    results = []
    vecs = list(embedder.embed(texts))
    for v in vecs:
        arr = np.array(v, dtype='float32')
        results.append(arr.tobytes())
    return results

def build_index(force=False):
    con = open_db()
    embedder = None  # lazy load — only if we have docs to embed

    existing = {row[0]: (row[1], row[2]) for row in con.execute('SELECT path, mtime, md5 FROM docs')}
    to_index = []

    for path in walk_vault():
        rel  = str(path.relative_to(VAULT))
        stat = path.stat()
        md5  = hashlib.md5(path.read_bytes()).hexdigest()
        if not force and rel in existing:
            cached_mtime, cached_md5 = existing[rel]
            if abs(cached_mtime - stat.st_mtime) < 1 and cached_md5 == md5:
                continue
        to_index.append((path, rel, stat.st_mtime, md5))

    # Remove deleted files
    vault_rels = {str(p.relative_to(VAULT)) for p in walk_vault()}
    stale = [r for r in existing if r not in vault_rels]
    if stale:
        con.executemany('DELETE FROM docs WHERE path=?', [(r,) for r in stale])

    if not to_index:
        print(f'[search] Index up to date ({len(existing)} docs)')
        con.commit(); con.close()
        return

    print(f'[search] Indexing {len(to_index)} new/changed docs...')
    embedder = get_embedder()

    BATCH = 32
    for i in range(0, len(to_index), BATCH):
        batch = to_index[i:i+BATCH]
        parsed = [parse_note(p) for p, *_ in batch]
        texts  = [f"{t}. {tags}. {body}" for t, tags, body in parsed]
        blobs  = embed_texts(embedder, texts)
        rows = [
            (rel, mtime, md5, parsed[j][0], parsed[j][2][:2000], parsed[j][1], blobs[j])
            for j, (_, rel, mtime, md5) in enumerate(batch)
        ]
        con.executemany(
            'INSERT OR REPLACE INTO docs(path,mtime,md5,title,body,tags,embedding) VALUES(?,?,?,?,?,?,?)',
            rows
        )
        con.commit()
        print(f'[search]   {min(i+BATCH, len(to_index))}/{len(to_index)} indexed')

    total = con.execute('SELECT COUNT(*) FROM docs').fetchone()[0]
    print(f'[search] Done. {total} docs in index.')
    con.close()

# ─── Search ───────────────────────────────────────────────────────────────────

def cosine(a_bytes: bytes, b_bytes: bytes) -> float:
    import numpy as np
    a = np.frombuffer(a_bytes, dtype='float32')
    b = np.frombuffer(b_bytes, dtype='float32')
    denom = (np.linalg.norm(a) * np.linalg.norm(b))
    return float(np.dot(a, b) / denom) if denom > 0 else 0.0

def bm25_score(query_terms: list[str], body: str, title: str) -> float:
    """Lightweight BM25-ish keyword score — no external lib needed."""
    text = (title + ' ' + body).lower()
    words = re.findall(r'\w+', text)
    total = len(words) or 1
    score = 0.0
    for term in query_terms:
        tf = text.count(term.lower())
        if tf:
            score += math.log(1 + tf) / math.log(1 + total / (tf + 1))
    return score

def search(query: str, top_n: int = TOP_N):
    con = open_db()
    count = con.execute('SELECT COUNT(*) FROM docs').fetchone()[0]
    if count == 0:
        print('[search] Index is empty — run with --reindex first.')
        con.close()
        return

    embedder = get_embedder()
    q_vec = next(embedder.embed([query]))

    import numpy as np
    q_bytes = np.array(q_vec, dtype='float32').tobytes()

    rows = con.execute('SELECT path, title, body, tags, embedding FROM docs').fetchall()
    con.close()

    query_terms = re.findall(r'\w+', query.lower())
    scores = []
    for path, title, body, tags, emb_bytes in rows:
        vec_score = cosine(q_bytes, emb_bytes)
        kw_score  = bm25_score(query_terms, (body or '') + ' ' + (tags or ''), title or '')
        # Normalize kw_score to ~0-1 range
        kw_norm = min(kw_score / 5.0, 1.0)
        hybrid = 0.7 * vec_score + 0.3 * kw_norm
        scores.append((hybrid, vec_score, kw_norm, path, title, body))

    scores.sort(reverse=True)
    top = scores[:top_n]

    print(f'\n🔍 Results for: "{query}"\n')
    for rank, (hybrid, vec, kw, path, title, body) in enumerate(top, 1):
        snippet = (body or '')[:120].replace('\n', ' ').strip()
        print(f'{rank}. [{title}]')
        print(f'   📁 {path}')
        print(f'   score={hybrid:.3f} (vec={vec:.3f} kw={kw:.3f})')
        print(f'   {snippet}...\n')

# ─── Entry point ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Vault semantic search')
    parser.add_argument('query', nargs='?', help='Search query')
    parser.add_argument('--reindex', action='store_true', help='Force full reindex')
    parser.add_argument('--top', type=int, default=TOP_N, help='Number of results')
    args = parser.parse_args()

    if args.reindex or not args.query:
        build_index(force=args.reindex)

    if args.query:
        # Auto-build index if empty
        con = open_db()
        count = con.execute('SELECT COUNT(*) FROM docs').fetchone()[0]
        con.close()
        if count == 0:
            build_index()
        search(args.query, top_n=args.top)

if __name__ == '__main__':
    main()

// Deterministic BM25 retrieval over durable memory records.
// The index is an accelerator, never the source of truth; every result keeps
// its provenance, authority and conflict qualifiers. Retrieval failure stays
// failure — an empty result is returned as explicitly empty, never invented.
const BM25_K1 = 1.5;
const BM25_B = 0.75;

function tokenize(text) {
  return text.toLowerCase().split(/[^a-z0-9äöüß]+/).filter((t) => t.length > 1);
}

export function bm25Query(records, query, { limit = 10, includeRevoked = true } = {}) {
  const docs = records
    .filter((r) => !r.deleted)
    .map((r) => ({ record: r, tokens: tokenize(r.content) }));
  if (docs.length === 0) return { ok: true, results: [], note: 'empty store' };
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return { ok: false, results: [], note: 'empty query' };

  const avgLen = docs.reduce((s, d) => s + d.tokens.length, 0) / docs.length;
  const df = new Map();
  for (const d of docs) {
    for (const t of new Set(d.tokens)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const scored = docs.map((d) => {
    let score = 0;
    for (const q of qTokens) {
      const f = d.tokens.filter((t) => t === q).length;
      if (f === 0) continue;
      const idf = Math.log(1 + (docs.length - (df.get(q) ?? 0) + 0.5) / ((df.get(q) ?? 0) + 0.5));
      score += idf * ((f * (BM25_K1 + 1)) / (f + BM25_K1 * (1 - BM25_B + BM25_B * (d.tokens.length / avgLen))));
    }
    return { record: d.record, score };
  });
  let results = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id)) // deterministic tie-break
    .slice(0, limit);
  if (!includeRevoked) results = results.filter((s) => !s.record.authority_revoked);
  return {
    ok: true,
    results: results.map((s) => ({
      score: s.score,
      id: s.record.id,
      kind: s.record.kind,
      content: s.record.content,
      source_provenance: s.record.source_provenance,
      authority: s.record.authority,
      confidence: s.record.confidence,
      qualifiers: s.record.qualifiers,
    })),
  };
}

// Shared vector helpers: Float32 <-> BLOB encoding and brute-force cosine search.
// Hoisted so multiple extensions (code-search, and future memory/RAG dedup) can
// share one implementation. Swapping to sqlite-vec later only touches this file.

export function encodeVector(vec: number[]): Uint8Array {
  return new Uint8Array(new Float32Array(vec).buffer);
}

export function decodeVector(buf: Uint8Array): number[] {
  // Copy into a fresh, 4-byte-aligned buffer (BLOBs from SQLite may be offset).
  const aligned = new Uint8Array(buf.length);
  aligned.set(buf);
  return Array.from(new Float32Array(aligned.buffer, 0, Math.floor(aligned.byteLength / 4)));
}

/** Encode an embedding for a nullable SQLite BLOB column: empty / absent -> null. */
export function encodeEmbeddingBlob(emb: number[] | undefined): Uint8Array | null {
  return emb && emb.length ? encodeVector(emb) : null;
}

/** Decode an embedding from a nullable SQLite BLOB column: null / short blob -> undefined. */
export function decodeEmbeddingBlob(blob: Uint8Array | null | undefined): number[] | undefined {
  return blob && blob.byteLength >= 4 ? decodeVector(blob) : undefined;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface Scored<T> {
  item: T;
  score: number;
}

export function topKByCosine<T>(query: number[], rows: Array<{ item: T; vector: number[] }>, k: number): Scored<T>[] {
  return rows
    .map((r) => ({ item: r.item, score: cosineSimilarity(query, r.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

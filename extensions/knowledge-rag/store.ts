// Knowledge store backed by node:sqlite (Node >= 22.5, no native deps).
// Embeddings are stored as Float32 BLOBs; retrieval is cosine when embeddings
// exist, otherwise a keyword frequency score (computed in JS — node:sqlite has
// no vector index). Swapping to sqlite-vec later only touches this file.

import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "../_shared/sqlite.js";
import {
  cosineSimilarity as cosine,
  decodeEmbeddingBlob as decodeEmbedding,
  encodeEmbeddingBlob as encodeEmbedding,
} from "../_shared/vector-store.js";
import { keywordScore } from "../_shared/keyword-score.js";
import { type EmbeddingConfig, embedTexts } from "./embedding.js";

export interface Chunk {
  id: string;
  source: string;
  text: string;
  embedding?: number[];
}

export interface SearchHit {
  chunk: Chunk;
  score: number;
}

const CHUNK_TARGET = 1200;
const CHUNK_OVERLAP = 150;

export function chunkText(text: string): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];

  const paragraphs = clean
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let buf = "";
  const flush = () => {
    if (buf.trim()) chunks.push(buf.trim());
    buf = "";
  };

  for (const p of paragraphs) {
    if (p.length > CHUNK_TARGET) {
      flush();
      for (let i = 0; i < p.length; i += CHUNK_TARGET - CHUNK_OVERLAP) {
        chunks.push(p.slice(i, i + CHUNK_TARGET));
      }
      continue;
    }
    if (buf.length + p.length + 2 > CHUNK_TARGET) flush();
    buf += (buf ? "\n\n" : "") + p;
  }
  flush();
  return chunks;
}

interface ChunkRow {
  id: string;
  source: string;
  text: string;
  embedding: Uint8Array | null;
}

export class KnowledgeStore {
  private db: DatabaseSync | undefined;

  constructor(private readonly file: string) {}

  load(): void {
    if (this.db) return;
    mkdirSync(dirname(this.file), { recursive: true });
    this.db = new DatabaseSync(this.file);
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
       CREATE TABLE IF NOT EXISTS chunks (
         id TEXT PRIMARY KEY,
         source TEXT NOT NULL,
         text TEXT NOT NULL,
         embedding BLOB
       );
       CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source);`,
    );
  }

  close(): void {
    this.db?.close();
    this.db = undefined;
  }

  private get database(): DatabaseSync {
    if (!this.db) this.load();
    return this.db as DatabaseSync;
  }

  private getModel(): string | null {
    const row = this.database.prepare("SELECT value FROM meta WHERE key = 'model'").get() as
      | { value?: string }
      | undefined;
    return row?.value ?? null;
  }

  private setModel(model: string): void {
    this.database
      .prepare("INSERT INTO meta(key, value) VALUES('model', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(model);
  }

  stats(): { chunks: number; sources: number; model: string | null } {
    const c = this.database.prepare("SELECT COUNT(*) AS n FROM chunks").get() as { n: number };
    const s = this.database.prepare("SELECT COUNT(DISTINCT source) AS n FROM chunks").get() as { n: number };
    return { chunks: c.n, sources: s.n, model: this.getModel() };
  }

  clear(): void {
    this.database.exec("DELETE FROM chunks; DELETE FROM meta;");
  }

  // Re-indexing the same `source` replaces its previous chunks.
  async addDocument(
    source: string,
    text: string,
    config: EmbeddingConfig,
    signal?: AbortSignal,
  ): Promise<number> {
    const pieces = chunkText(text);
    if (!pieces.length) return 0;

    let embeddings: Array<number[] | undefined> = pieces.map(() => undefined);
    if (config.enabled) {
      embeddings = await embedTexts(pieces, config, signal);
      this.setModel(config.model);
    }

    const db = this.database;
    db.prepare("DELETE FROM chunks WHERE source = ?").run(source);
    const insert = db.prepare("INSERT OR REPLACE INTO chunks(id, source, text, embedding) VALUES(?, ?, ?, ?)");
    pieces.forEach((piece, i) => {
      const id = createHash("sha1").update(`${source}:${i}:${piece}`).digest("hex").slice(0, 12);
      insert.run(id, source, piece, encodeEmbedding(embeddings[i]));
    });

    return pieces.length;
  }

  async search(
    query: string,
    topK: number,
    config: EmbeddingConfig,
    signal?: AbortSignal,
  ): Promise<SearchHit[]> {
    const rows = this.database.prepare("SELECT id, source, text, embedding FROM chunks").all() as unknown as ChunkRow[];
    if (!rows.length) return [];

    const chunks: Chunk[] = rows.map((r) => ({
      id: r.id,
      source: r.source,
      text: r.text,
      embedding: decodeEmbedding(r.embedding),
    }));

    const canUseVectors = config.enabled && chunks.some((c) => c.embedding);
    let scored: SearchHit[];

    if (canUseVectors) {
      const [q] = await embedTexts([query], config, signal);
      scored = chunks.map((chunk) => ({
        chunk,
        score: chunk.embedding ? cosine(q, chunk.embedding) : 0,
      }));
    } else {
      scored = chunks.map((chunk) => ({
        chunk,
        score: keywordScore(query, chunk.text),
      }));
    }

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, topK));
  }
}

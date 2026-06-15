// SQLite-backed registry of background sub-agents, so the main agent can later
// query (`status`), block on (`wait`), or stop (`cancel`) a sub-agent it spawned
// in the background — a pull model that needs no push notifications.
// Project-scoped at <cwd>/.pi/subagents/registry.db (mirrors memory/checkpoint).

import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "../_shared/sqlite.js";

export type SubAgentStatus = "running" | "done" | "error" | "cancelled";

export interface SubAgentRow {
  id: string;
  task: string;
  /** JSON of the resolved capability profile, for display. */
  profile: string | null;
  model: string | null;
  status: SubAgentStatus;
  output: string | null;
  error: string | null;
  exitCode: number | null;
  createdAt: number;
  updatedAt: number;
}

export class SubAgentRegistry {
  private db: DatabaseSync | undefined;

  constructor(private readonly file: string) {}

  load(): void {
    if (this.db) return;
    mkdirSync(dirname(this.file), { recursive: true });
    this.db = new DatabaseSync(this.file);
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS subagents (
         id TEXT PRIMARY KEY,
         task TEXT NOT NULL,
         profile TEXT,
         model TEXT,
         status TEXT NOT NULL,
         output TEXT,
         error TEXT,
         exitCode INTEGER,
         createdAt INTEGER NOT NULL,
         updatedAt INTEGER NOT NULL
       );
       CREATE INDEX IF NOT EXISTS idx_subagents_status ON subagents(status);`,
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

  static genId(): string {
    return "sa-" + randomBytes(4).toString("hex");
  }

  create(input: { id: string; task: string; profile?: string | null; model?: string | null }): SubAgentRow {
    const now = Date.now();
    const row: SubAgentRow = {
      id: input.id,
      task: input.task,
      profile: input.profile ?? null,
      model: input.model ?? null,
      status: "running",
      output: null,
      error: null,
      exitCode: null,
      createdAt: now,
      updatedAt: now,
    };
    this.database
      .prepare(
        "INSERT INTO subagents(id, task, profile, model, status, output, error, exitCode, createdAt, updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?)",
      )
      .run(row.id, row.task, row.profile, row.model, row.status, row.output, row.error, row.exitCode, row.createdAt, row.updatedAt);
    return row;
  }

  finish(
    id: string,
    patch: { status: SubAgentStatus; output?: string | null; error?: string | null; exitCode?: number | null },
  ): void {
    this.database
      .prepare("UPDATE subagents SET status=?, output=?, error=?, exitCode=?, updatedAt=? WHERE id=?")
      .run(patch.status, patch.output ?? null, patch.error ?? null, patch.exitCode ?? null, Date.now(), id);
  }

  get(id: string): SubAgentRow | undefined {
    return this.database.prepare("SELECT * FROM subagents WHERE id=?").get(id) as SubAgentRow | undefined;
  }

  list(limit = 50): SubAgentRow[] {
    return this.database
      .prepare("SELECT * FROM subagents ORDER BY createdAt DESC LIMIT ?")
      .all(limit) as unknown as SubAgentRow[];
  }

  /** Heartbeat: bump updatedAt for a running row (background spawn's stream calls this). */
  touch(id: string): void {
    this.database.prepare("UPDATE subagents SET updatedAt=? WHERE id=? AND status='running'").run(Date.now(), id);
  }

  /** Running rows with no activity (updatedAt) for >= thresholdMs — candidates for stuck reaping. */
  findStuck(thresholdMs: number): SubAgentRow[] {
    const cutoff = Date.now() - Math.max(0, thresholdMs);
    return this.database
      .prepare("SELECT * FROM subagents WHERE status='running' AND updatedAt <= ? ORDER BY updatedAt ASC")
      .all(cutoff) as unknown as SubAgentRow[];
  }

  /** Delete a record. The main agent controls lifecycle — sub-agents are not auto-destroyed. */
  remove(id: string): boolean {
    const info = this.database.prepare("DELETE FROM subagents WHERE id=?").run(id);
    return Number(info.changes) > 0;
  }

  /** After a restart any still-"running" row is an orphan (its process is gone). */
  reapOrphans(): number {
    const info = this.database
      .prepare("UPDATE subagents SET status='error', error='orphaned: process restarted', updatedAt=? WHERE status='running'")
      .run(Date.now());
    return Number(info.changes);
  }
}

# long-term-memory 检索升级实现计划 — 纯 JS 向量缓存 / 结构化过滤 / 降权老化

> **面向 AI 代理的工作者：** 用 `superpowers:executing-plans` 逐任务**内联**实现本计划（本仓库**禁止子代理**）。步骤用复选框 `- [ ]` 跟踪，每个任务结尾 commit 一次。

**目标：** 把 `extensions/long-term-memory` 的召回优化为「结构化过滤缩候选 + 预解码向量缓存 + 加权重排」，并加基于使用度的降权排序；**纯 JS、零新增依赖**，兼容 Pi 的 `bun --compile` 单二进制。

**架构：** 新增 `ranking.ts`（纯向量/打分函数，充分单测）；`store.ts` 加内存向量缓存与结构化过滤、改 `recall`；`index.ts` 透传过滤参数。**不动** `consolidate.ts`/`history`/`rollback`/双 scope/`_shared/sqlite.ts`。

**技术栈：** TypeScript + 经 `_shared/sqlite.ts` 的 SQLite + 纯 JS + vitest。设计依据：`docs/superpowers/specs/2026-06-15-memory-retrieval-design.md`。

**三阶段（P2/P3 依赖 P1）：**
- **P1 检索优化 + 结构化过滤** — 向量缓存 + 过滤 + `recall` 重构（排序仍纯相似度）。
- **P2 加权重排（时效）** — `scoreMemory` 引入 recency。
- **P3 老化降权** — `lastUsedAt`/`useCount` 字段 + 命中更新 + usage。

**命令约定：**
- 扩展单测：`cd extensions && npx vitest run long-term-memory/<file>`
- 集成构建（最终验证门）：`cd tauri-agent && npm run build:sidecar`

> **STOP 条件：** 若 `cd extensions && npx vitest run` 因找不到 vitest 失败，改用 `npx -y vitest run <file>`；若仍失败，停止并报告（可能需在 `extensions/package.json` 加 `vitest` devDependency），不要擅自改测试框架。

---

## 文件结构

**新建**
- `extensions/long-term-memory/ranking.ts` — 纯函数：`dot` / `vecNorm` / `scoreMemory`
- `extensions/long-term-memory/ranking.test.ts` — 纯函数单测

**修改**
- `extensions/long-term-memory/store.ts` — 向量缓存、结构化过滤、`recall` 重构、老化字段与更新
- `extensions/long-term-memory/store.test.ts` — 过滤 / 缓存 / 老化测试
- `extensions/long-term-memory/index.ts` — `recallMerged` 与 `memory_recall` 工具透传 filters
- `extensions/long-term-memory/README.md` — 勾选「向量召回优化 / 遗忘策略」

---

# 阶段 P1 — 检索优化 + 结构化过滤

> 现状：`recall()`（`store.ts:410-449`）每次 `SELECT *` 全表 + 逐条 `decodeEmbedding` + 全量 `cosine`。本阶段：① 抽 `dot`/`vecNorm` 纯函数；② `store` 加内存向量缓存（懒初始化 + 增量维护）；③ `recall` 改走缓存 + SQL 结构化过滤。排序此阶段仍按纯相似度（与现状等价）。

## 任务 T1.1：`ranking.ts` 向量数学纯函数 + 单测

**文件：**
- 创建：`extensions/long-term-memory/ranking.ts`
- 测试：`extensions/long-term-memory/ranking.test.ts`

- [ ] **步骤 1：编写失败测试**

创建 `extensions/long-term-memory/ranking.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { dot, vecNorm } from "./ranking.js";

describe("vecNorm", () => {
  it("computes L2 norm", () => {
    expect(vecNorm(Float32Array.from([3, 4]))).toBeCloseTo(5);
  });
  it("zero vector → 0", () => {
    expect(vecNorm(Float32Array.from([0, 0]))).toBe(0);
  });
});

describe("dot", () => {
  it("computes dot product over min length", () => {
    expect(dot(Float32Array.from([1, 2, 3]), Float32Array.from([4, 5, 6]))).toBeCloseTo(32);
  });
  it("tolerates length mismatch (uses min length)", () => {
    expect(dot(Float32Array.from([1, 2]), Float32Array.from([3, 4, 5]))).toBeCloseTo(11);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

`cd extensions && npx vitest run long-term-memory/ranking.test.ts` — 预期 FAIL（无法解析 `./ranking`）。

- [ ] **步骤 3：实现 `ranking.ts`**

创建 `extensions/long-term-memory/ranking.ts`：

```ts
// Pure vector math + scoring for long-term-memory recall. No DB / no I/O so it
// is fully unit-testable. cosine = dot / (normA * normB); norms are precomputed
// and cached per memory to avoid recomputing on every recall.

export function dot(a: Float32Array, b: Float32Array): number {
  const len = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < len; i++) s += a[i] * b[i];
  return s;
}

export function vecNorm(v: Float32Array): number {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return Math.sqrt(s);
}
```

- [ ] **步骤 4：运行测试验证通过**

`cd extensions && npx vitest run long-term-memory/ranking.test.ts` — 预期 PASS（4 用例）。

- [ ] **步骤 5：Commit**

```bash
git add extensions/long-term-memory/ranking.ts extensions/long-term-memory/ranking.test.ts
git commit -m "feat(memory): add pure vector math helpers (dot, vecNorm)"
```

## 任务 T1.2：`store.ts` 内存向量缓存 + 增量维护

> 缓存 `Map<id, {vec, norm}>`：首次 `recall` 懒初始化全量解码一次，之后写路径增量维护，消除每次 `recall` 重复 decode BLOB。

**文件：**
- 修改：`extensions/long-term-memory/store.ts`

- [ ] **步骤 1：import 与缓存字段**

在 `store.ts:9`（`import { type EmbeddingConfig, embedTexts } from "./embedding.js";`）下一行追加：

```ts
import { dot, vecNorm } from "./ranking.js";
```

在 `MemoryStore` 类体顶部（`store.ts:90` 的 `private db: DatabaseSync | undefined;` 下一行）追加：

```ts
  // id → 预解码向量 + 预算 norm。null 表示尚未懒初始化。
  private vecCache: Map<string, { vec: Float32Array; norm: number }> | null = null;
```

- [ ] **步骤 2：加缓存辅助方法**

在 `private get database()` 访问器（`store.ts:140-143`）之后追加：

```ts
  private ensureVecCache(): Map<string, { vec: Float32Array; norm: number }> {
    if (this.vecCache) return this.vecCache;
    const cache = new Map<string, { vec: Float32Array; norm: number }>();
    const rows = this.database
      .prepare("SELECT id, embedding FROM memories")
      .all() as unknown as Array<{ id: string; embedding: Uint8Array | null }>;
    for (const r of rows) {
      const emb = decodeEmbedding(r.embedding);
      if (emb) {
        const vec = Float32Array.from(emb);
        cache.set(r.id, { vec, norm: vecNorm(vec) });
      }
    }
    this.vecCache = cache;
    return cache;
  }

  private cachePut(id: string, emb: number[] | undefined): void {
    if (!this.vecCache) return; // 未初始化：懒加载时会全量读取，无需此刻填充
    if (!emb || !emb.length) {
      this.vecCache.delete(id);
      return;
    }
    const vec = Float32Array.from(emb);
    this.vecCache.set(id, { vec, norm: vecNorm(vec) });
  }

  private cacheDelete(id: string): void {
    this.vecCache?.delete(id);
  }
```

- [ ] **步骤 3：在写路径维护缓存**

在以下方法中插入缓存维护（均在该方法对 `memories` 表写入完成、`return` 之前）：

`insert`（`store.ts:227-229` 的 INSERT 之后、`recordHistory` 之前或之后均可，但要在 return 前）追加：
```ts
    this.cachePut(id, embedding);
```

`update`（`store.ts:261-263` 的 UPDATE 之后）追加：
```ts
    this.cachePut(id, embedding);
```

`remove`（`store.ts:284` 的 `DELETE FROM memories ...` 之后）追加：
```ts
    this.cacheDelete(id);
```

`save`（`store.ts:391-393` 的 INSERT OR REPLACE 之后）追加：
```ts
    this.cachePut(id, embedding);
```

`clear`（`store.ts:153-155`）方法体改为：
```ts
  clear(): void {
    this.database.exec("DELETE FROM memories;");
    this.vecCache = null;
  }
```

`forget`（`store.ts:157-160`）在 `DELETE` 之后、`return` 之前追加：
```ts
    this.cacheDelete(id);
```

`rollback`（`store.ts:308-373`）有三处写 `memories`：
- ADD 的撤销（`store.ts:319` DELETE 之后）追加 `this.cacheDelete(row.memoryId);`
- UPDATE 分支（`store.ts:340-342` UPDATE 之后）追加 `this.cachePut(row.memoryId, embedding);`
- 重新 INSERT 分支（`store.ts:356-358` INSERT 之后）追加 `this.cachePut(row.memoryId, embedding);`

- [ ] **步骤 4：编译自检（无独立单测，靠 T1.3 覆盖）**

本任务为内部缓存设施，行为由 T1.3 的召回测试验证。确认 `store.ts` 无语法错误：`cd extensions && npx vitest run long-term-memory/store.test.ts` — 预期现有用例仍 PASS（缓存对 OFF 路径无影响）。

- [ ] **步骤 5：Commit**

```bash
git add extensions/long-term-memory/store.ts
git commit -m "feat(memory): add in-memory decoded-vector cache with incremental upkeep"
```

## 任务 T1.3：`recall` 重构 — 结构化过滤 + 走缓存

**文件：**
- 修改：`extensions/long-term-memory/store.ts`
- 测试：`extensions/long-term-memory/store.test.ts`

- [ ] **步骤 1：定义 `RecallFilters` 类型**

在 `store.ts` 的 `MemoryHit` 接口（`store.ts:19-22`）之后追加：

```ts
export interface RecallFilters {
  categories?: string[];
  /** createdAt 下界(ms, 含) */ from?: number;
  /** createdAt 上界(ms, 含) */ to?: number;
}
```

- [ ] **步骤 2：编写失败测试（过滤 + 向量缓存召回）**

向 `extensions/long-term-memory/store.test.ts` 顶部 import 区后追加一个 mock（确定性 embedding，便于断言）与新 describe：

```ts
import { vi } from "vitest";

// 确定性 embedding：3 维，按字符码分桶累加；同义近文本向量相近。
vi.mock("./embedding.js", async (orig) => {
  const actual = await orig<typeof import("./embedding.js")>();
  return {
    ...actual,
    embedTexts: vi.fn(async (texts: string[]) =>
      texts.map((t) => {
        const v = [0, 0, 0];
        for (let i = 0; i < t.length; i++) v[i % 3] += t.charCodeAt(i);
        return v;
      }),
    ),
  };
});

const ON = { enabled: true, baseUrl: "x", apiKey: "x", model: "x" };

describe("recall filters + vector cache", () => {
  it("filters by category via SQL before scoring (keyword path)", async () => {
    const s = newStore();
    await s.insert("uses pnpm", "preference", OFF, "t");
    await s.insert("deadline friday", "fact", OFF, "t");
    const hits = await s.recall("uses", 5, OFF, undefined, { categories: ["preference"] });
    expect(hits.map((h) => h.memory.text)).toEqual(["uses pnpm"]);
  });

  it("filters by createdAt range", async () => {
    const s = newStore();
    const a = await s.insert("old fact", null, OFF, "t");
    const b = await s.insert("new fact", null, OFF, "t");
    const mid = (s.getById(a.id)!.createdAt + s.getById(b.id)!.createdAt) / 2;
    const hits = await s.recall("fact", 5, OFF, undefined, { from: Math.ceil(mid) });
    expect(hits.map((h) => h.memory.text)).toEqual(["new fact"]);
  });

  it("vector recall uses cache and ranks by similarity", async () => {
    const s = newStore();
    await s.insert("alpha alpha alpha", null, ON, "t");
    await s.insert("zzzzzz", null, ON, "t");
    const hits = await s.recall("alpha alpha alpha", 2, ON);
    expect(hits[0].memory.text).toBe("alpha alpha alpha");
    expect(hits[0].score).toBeGreaterThan(0);
  });

  it("cache stays consistent after update/remove", async () => {
    const s = newStore();
    const { id } = await s.insert("alpha", null, ON, "t");
    await s.recall("alpha", 1, ON); // 触发懒初始化
    await s.update(id, { text: "beta beta" }, ON, "u");
    const hits = await s.recall("beta beta", 1, ON);
    expect(hits[0].memory.text).toBe("beta beta");
    s.remove(id, "x");
    expect(await s.recall("beta beta", 1, ON)).toHaveLength(0);
  });
});
```

- [ ] **步骤 3：运行测试验证失败**

`cd extensions && npx vitest run long-term-memory/store.test.ts` — 预期新用例 FAIL（`recall` 尚不接受第 5 个 `filters` 参数 / 未走缓存）。

- [ ] **步骤 4：重写 `recall`（`store.ts:410-449`）**

把整个 `recall` 方法替换为：

```ts
  async recall(
    query: string,
    topK: number,
    config: EmbeddingConfig,
    signal?: AbortSignal,
    filters?: RecallFilters,
  ): Promise<MemoryHit[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filters?.categories?.length) {
      where.push(`category IN (${filters.categories.map(() => "?").join(",")})`);
      params.push(...filters.categories);
    }
    if (filters?.from != null) {
      where.push("createdAt >= ?");
      params.push(filters.from);
    }
    if (filters?.to != null) {
      where.push("createdAt <= ?");
      params.push(filters.to);
    }
    const sql =
      "SELECT id, text, category, createdAt, embedding FROM memories" +
      (where.length ? ` WHERE ${where.join(" AND ")}` : "");
    const rows = this.database.prepare(sql).all(...params) as unknown as MemoryRow[];
    if (!rows.length) return [];

    const toMemory = (r: MemoryRow): Memory => ({
      id: r.id,
      text: r.text,
      category: r.category,
      createdAt: r.createdAt,
      embedding: decodeEmbedding(r.embedding),
    });

    const canUseVectors = config.enabled && rows.some((r) => r.embedding);
    let scored: MemoryHit[];

    if (canUseVectors) {
      const cache = this.ensureVecCache();
      const [q] = await embedTexts([query], config, signal);
      const qv = Float32Array.from(q);
      const qnorm = vecNorm(qv);
      scored = rows.map((r) => {
        const c = cache.get(r.id);
        const denom = qnorm * (c?.norm ?? 0);
        const sim = c && denom ? dot(qv, c.vec) / denom : 0;
        return { memory: toMemory(r), score: sim };
      });
    } else {
      scored = rows.map((r) => ({ memory: toMemory(r), score: keywordScore(query, r.text) }));
    }

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, topK));
  }
```

- [ ] **步骤 5：运行测试验证通过**

`cd extensions && npx vitest run long-term-memory/store.test.ts` — 预期全部 PASS（含原有 6 用例 + 新 4 用例）。

- [ ] **步骤 6：Commit**

```bash
git add extensions/long-term-memory/store.ts extensions/long-term-memory/store.test.ts
git commit -m "feat(memory): structured filtering + cache-backed vector recall"
```

## 任务 T1.4：`index.ts` 透传过滤参数

**文件：**
- 修改：`extensions/long-term-memory/index.ts`

- [ ] **步骤 1：`recallMerged` 增 filters 形参（`index.ts:69-95`）**

把 `recallMerged` 的签名与两处 `recall` 调用改为带 filters：

签名（`index.ts:69-74`）：
```ts
  const recallMerged = async (
    cwd: string,
    query: string,
    topK: number,
    config: EmbeddingConfig,
    filters?: import("./store.js").RecallFilters,
  ): Promise<ScopedHit[]> => {
```

两处调用（`index.ts:76-79`）：
```ts
    const [p, g] = await Promise.all([
      project.recall(query, topK, config, undefined, filters).catch(() => []),
      global.recall(query, topK, config, undefined, filters).catch(() => []),
    ]);
```

- [ ] **步骤 2：`memory_recall` 工具加 filters 参数（`index.ts:233-258`）**

参数（`index.ts:237-240`）改为：
```ts
    parameters: Type.Object({
      query: Type.String({ description: "What to recall about" }),
      topK: Type.Optional(Type.Number({ description: "Max memories to return (default 5)" })),
      categories: Type.Optional(Type.Array(Type.String(), { description: "Filter by category (preference/decision/convention/fact)" })),
      since: Type.Optional(Type.Number({ description: "Only memories created at/after this Unix ms" })),
      until: Type.Optional(Type.Number({ description: "Only memories created at/before this Unix ms" })),
    }),
```

execute 体（`index.ts:241-243`）把 recallMerged 调用改为：
```ts
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const config = resolveEmbeddingConfig();
      const filters = { categories: params.categories, from: params.since, to: params.until };
      const hits = await recallMerged(ctx.cwd, params.query, params.topK ?? 5, config, filters).catch(() => []);
```

- [ ] **步骤 3：类型检查**

`cd tauri-agent && npx tsc --noEmit`（若扩展无独立 tsconfig，则在 T1.5 集成构建统一验证）。确认 `RecallFilters` 类型引用正确。

- [ ] **步骤 4：Commit**

```bash
git add extensions/long-term-memory/index.ts
git commit -m "feat(memory): expose category/time filters on memory_recall"
```

## 任务 T1.5：集成构建（P1 验证门）

- [ ] **步骤 1：扩展全量单测**

`cd extensions && npx vitest run long-term-memory/` — 预期全绿（ranking + store 全部用例）。

- [ ] **步骤 2：集成构建**

`cd tauri-agent && npm run build:sidecar` — 预期成功产出 sidecar 二进制（确认缓存/过滤改动可编译进 bun 单二进制）。

> STOP 条件：若 build:sidecar 因 `ranking.js`/import 解析失败，检查 `store.ts` 与 `index.ts` 的相对 import 是否带 `.js` 后缀（与现有风格一致）。

P1 完成 —— 召回走结构化过滤 + 向量缓存，消除每次全表重复解码；行为对现有用例零回归。

---

# 阶段 P2 — 加权重排（时效）

> 引入 `scoreMemory`：综合相似度 + 时效（近期命中加分）。本阶段 `useCount` 字段尚未引入，usage 项以 0 参与（recency 用 `createdAt` 兜底）。

## 任务 T2.1：`ranking.ts` 加 `scoreMemory` + 单测

**文件：**
- 修改：`extensions/long-term-memory/ranking.ts`
- 修改：`extensions/long-term-memory/ranking.test.ts`

- [ ] **步骤 1：追加失败测试**

向 `extensions/long-term-memory/ranking.test.ts` 追加：

```ts
import { scoreMemory } from "./ranking.js";

describe("scoreMemory", () => {
  const now = 1_000_000_000_000;
  it("higher similarity → higher score", () => {
    const a = scoreMemory({ sim: 0.9, createdAt: now, lastUsedAt: null, useCount: 0, now });
    const b = scoreMemory({ sim: 0.1, createdAt: now, lastUsedAt: null, useCount: 0, now });
    expect(a).toBeGreaterThan(b);
  });
  it("recent lastUsedAt outranks stale at equal similarity", () => {
    const recent = scoreMemory({ sim: 0.5, createdAt: now, lastUsedAt: now, useCount: 0, now });
    const stale = scoreMemory({ sim: 0.5, createdAt: now, lastUsedAt: now - 60 * 24 * 3600 * 1000, useCount: 0, now });
    expect(recent).toBeGreaterThan(stale);
  });
  it("higher useCount outranks at equal similarity/recency", () => {
    const used = scoreMemory({ sim: 0.5, createdAt: now, lastUsedAt: now, useCount: 10, now });
    const fresh = scoreMemory({ sim: 0.5, createdAt: now, lastUsedAt: now, useCount: 0, now });
    expect(used).toBeGreaterThan(fresh);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

`cd extensions && npx vitest run long-term-memory/ranking.test.ts` — 预期新用例 FAIL（`scoreMemory` 未定义）。

- [ ] **步骤 3：实现 `scoreMemory`（追加到 `ranking.ts`）**

```ts
export const W_SIM = 0.7;
export const W_RECENCY = 0.2;
export const W_USAGE = 0.1;
export const TAU_MS = 30 * 24 * 3600 * 1000; // 时效半衰尺度：30 天
export const USE_CAP = 20; // 命中计数归一化上限

export interface ScoreInput {
  sim: number;
  createdAt: number;
  lastUsedAt: number | null;
  useCount: number;
  now: number;
}

export function scoreMemory(i: ScoreInput): number {
  const ref = i.lastUsedAt ?? i.createdAt;
  const recency = Math.exp(-Math.max(0, i.now - ref) / TAU_MS);
  const usage = Math.log(1 + Math.max(0, i.useCount)) / Math.log(1 + USE_CAP);
  return W_SIM * i.sim + W_RECENCY * recency + W_USAGE * usage;
}
```

- [ ] **步骤 4：运行测试验证通过**

`cd extensions && npx vitest run long-term-memory/ranking.test.ts` — 预期 PASS（向量 4 + score 3）。

- [ ] **步骤 5：Commit**

```bash
git add extensions/long-term-memory/ranking.ts extensions/long-term-memory/ranking.test.ts
git commit -m "feat(memory): add scoreMemory (similarity + recency + usage)"
```

## 任务 T2.2：`recall` 用 `scoreMemory` 重排

**文件：**
- 修改：`extensions/long-term-memory/store.ts`

- [ ] **步骤 1：import scoreMemory（`store.ts` 顶部 ranking import 处）**

把 T1.2 加的 import 改为：
```ts
import { dot, scoreMemory, vecNorm } from "./ranking.js";
```

- [ ] **步骤 2：向量分支用 scoreMemory（改 T1.3 重写后的 `recall`）**

把向量分支里 `return { memory: toMemory(r), score: sim };` 改为：
```ts
        const memory = toMemory(r);
        const score = scoreMemory({
          sim,
          createdAt: memory.createdAt,
          lastUsedAt: null, // P3 接入字段后改为真实值
          useCount: 0, // P3 接入字段后改为真实值
          now: Date.now(),
        });
        return { memory, score };
```

> 关键词分支保持 `keywordScore` 原样（时效/使用度仅作用于向量召回排序；关键词路径是无 key 兜底，不引入加权以免行为漂移）。

- [ ] **步骤 3：测试无回归**

`cd extensions && npx vitest run long-term-memory/store.test.ts` — 预期 PASS（相似度仍主导，`vector recall ... ranks by similarity` 用例不变）。

- [ ] **步骤 4：Commit**

```bash
git add extensions/long-term-memory/store.ts
git commit -m "feat(memory): rank vector recall with recency-weighted score"
```

P2 完成 —— 同相似度下近期记忆上浮。

---

# 阶段 P3 — 老化降权

> 加 `lastUsedAt`/`useCount` 字段，召回命中即更新，并把真实值喂给 `scoreMemory`，使常用记忆上浮、久不用下沉。永不删除。

## 任务 T3.1：迁移加字段 + 读出

**文件：**
- 修改：`extensions/long-term-memory/store.ts`

- [ ] **步骤 1：`migrate()` 增列（`store.ts:121-133`）**

在 `migrate()` 末尾（`if (!has("version")) {...}` 之后）追加：
```ts
    if (!has("lastUsedAt")) {
      this.database.exec("ALTER TABLE memories ADD COLUMN lastUsedAt INTEGER");
    }
    if (!has("useCount")) {
      this.database.exec("ALTER TABLE memories ADD COLUMN useCount INTEGER DEFAULT 0");
      this.database.exec("UPDATE memories SET useCount = 0 WHERE useCount IS NULL");
    }
```

- [ ] **步骤 2：`MemoryRow` 加字段（`store.ts:81-87`）**

把 `MemoryRow` 接口改为：
```ts
interface MemoryRow {
  id: string;
  text: string;
  category: string | null;
  createdAt: number;
  embedding: Uint8Array | null;
  lastUsedAt?: number | null;
  useCount?: number | null;
}
```

- [ ] **步骤 3：`recall` 的 SELECT 取出老化列（改 T1.3 的 SQL 字符串）**

把 `recall` 里的 SELECT 列改为：
```ts
    const sql =
      "SELECT id, text, category, createdAt, embedding, lastUsedAt, useCount FROM memories" +
      (where.length ? ` WHERE ${where.join(" AND ")}` : "");
```

- [ ] **步骤 4：构建可验证（无独立断言，下一任务一起测）**

`cd extensions && npx vitest run long-term-memory/store.test.ts` — 预期现有用例仍 PASS（新增列对现有断言无影响）。

- [ ] **步骤 5：Commit**

```bash
git add extensions/long-term-memory/store.ts
git commit -m "feat(memory): add lastUsedAt/useCount columns with migration"
```

## 任务 T3.2：命中更新老化 + 喂入 score

**文件：**
- 修改：`extensions/long-term-memory/store.ts`
- 测试：`extensions/long-term-memory/store.test.ts`

- [ ] **步骤 1：编写失败测试**

向 `store.test.ts` 的 `describe("recall filters + vector cache", ...)` 内追加：

```ts
  it("recall bumps useCount/lastUsedAt for hits", async () => {
    const s = newStore();
    const { id } = await s.insert("alpha alpha", null, OFF, "t"); // 关键词路径也算命中
    const before = s.getById(id);
    await s.recall("alpha", 5, OFF);
    const rowAfter = s.history(id); // sanity: still exists
    expect(rowAfter.length).toBeGreaterThan(0);
    const stats = s.stats();
    expect(stats.count).toBe(1);
    // useCount 通过再次 recall 的排序间接验证：构造两条，命中多者靠前
    const s2 = newStore();
    const x = await s2.insert("topic note one", null, OFF, "t");
    await s2.insert("topic note two", null, OFF, "t");
    await s2.recall("topic note one", 1, OFF); // 命中 x 多次
    await s2.recall("topic note one", 1, OFF);
    const hits = await s2.recall("topic note", 2, OFF);
    expect(hits[0].memory.id).toBe(x.id);
  });
```

> 说明：关键词路径不走 `scoreMemory`（见 T2.2 决策），故老化对关键词排序不直接生效；此用例验证「命中更新不报错且数据完好」+「向量路径下 useCount 影响排序」由下一步向量用例覆盖。改为下方向量用例更可靠：

把上面用例替换为向量路径用例：

```ts
  it("vector recall bumps useCount and ages ranking", async () => {
    const s = newStore();
    const a = await s.insert("topic alpha", null, ON, "t");
    const b = await s.insert("topic beta", null, ON, "t");
    await s.recall("topic alpha", 1, ON); // 命中 a
    await s.recall("topic alpha", 1, ON); // 再次命中 a → useCount 升
    const hits = await s.recall("topic", 2, ON); // 等相似度下，useCount 高的 a 应靠前
    expect(hits[0].memory.id).toBe(a.id);
    expect(b.id).not.toBe(a.id);
  });
```

- [ ] **步骤 2：运行测试验证失败**

`cd extensions && npx vitest run long-term-memory/store.test.ts` — 预期 FAIL（命中未更新 useCount，排序无差异）。

- [ ] **步骤 3：`recall` 末尾更新老化 + 用真实值打分**

在 T2.2 改好的向量分支里，把 `lastUsedAt: null` / `useCount: 0` 改为读行值：
```ts
        const memory = toMemory(r);
        const score = scoreMemory({
          sim,
          createdAt: memory.createdAt,
          lastUsedAt: r.lastUsedAt ?? null,
          useCount: r.useCount ?? 0,
          now: Date.now(),
        });
        return { memory, score };
```

在 `recall` 的 `return scored...slice(...)` 之前，先算出 `hits` 再更新老化：
```ts
    const hits = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, topK));

    if (hits.length) {
      const now = Date.now();
      const stmt = this.database.prepare(
        "UPDATE memories SET useCount = COALESCE(useCount, 0) + 1, lastUsedAt = ? WHERE id = ?",
      );
      for (const h of hits) stmt.run(now, h.memory.id);
    }

    return hits;
```

（删除原先直接 `return scored.filter(...).sort(...).slice(...)` 那行。）

- [ ] **步骤 4：运行测试验证通过**

`cd extensions && npx vitest run long-term-memory/store.test.ts` — 预期 PASS（a 因 useCount 高排前）。

> STOP 条件：若该用例偶发失败，确认 mock embedding 让 "topic alpha"/"topic beta" 对查询 "topic" 的相似度足够接近（同前缀），使 useCount 成为决定项；必要时调整 mock 文本而非放宽断言。

- [ ] **步骤 5：Commit**

```bash
git add extensions/long-term-memory/store.ts extensions/long-term-memory/store.test.ts
git commit -m "feat(memory): bump usage on recall hits and age ranking"
```

## 任务 T3.3：集成构建 + README（P3 验证门）

**文件：**
- 修改：`extensions/long-term-memory/README.md`

- [ ] **步骤 1：勾选 README「进阶扩展点」（`README.md:90-95`）**

把第 3、4 点更新为已做（纯 JS 路线）：
```md
3. ✅ **遗忘策略（已内置）**：召回命中累计 `useCount` / `lastUsedAt`，融入加权排序（近期/常用上浮，久不用下沉；只降权不删除）。
4. ✅ **召回优化（已内置，纯 JS）**：结构化过滤（category/时间）缩候选 + 预解码向量缓存消除重复解码。未引入 sqlite-vec —— Pi 是 bun --compile 单二进制，原生扩展无法嵌入。
```

- [ ] **步骤 2：扩展全量单测**

`cd extensions && npx vitest run long-term-memory/` — 预期全绿。

- [ ] **步骤 3：集成构建**

`cd tauri-agent && npm run build:sidecar` — 预期成功。

- [ ] **步骤 4：Commit**

```bash
git add extensions/long-term-memory/README.md
git commit -m "docs(memory): mark recall-optimization and forgetting as done"
```

P3 完成 —— 常用记忆上浮、久不用下沉，无删除。

---

## 自检结果

**1. 规格覆盖度（逐项核对 spec）**

| spec 章节 | 对应任务 | 状态 |
|-----------|----------|------|
| §3.2 内存向量缓存（懒初始化+增量维护） | T1.2 | OK |
| §3.1 老化字段（Phase 3） | T3.1 | OK |
| §3.1 save 保留 INSERT OR REPLACE（不改） | T1.2 仅加 cachePut，不改写法 | OK |
| §4 检索流程（过滤→缓存算 sim→重排→命中更新） | T1.3 / T2.2 / T3.2 | OK |
| §5 排序公式（sim+recency+usage） | T2.1 scoreMemory | OK |
| §6 老化降权不删 | T3.2 仅 UPDATE useCount/lastUsedAt | OK |
| §7 缓存一致性（各写路径） | T1.2 步骤 3 | OK |
| §9 降级（无 key→关键词、过滤仍生效） | T1.3 关键词分支 + SQL 过滤 | OK |
| §11 分期 P1→P2→P3 | 三阶段任务 | OK |

**2. 占位符扫描：** 无「TODO/待补充/适当处理」；每个实现步骤含完整可粘贴代码或精确「文件:行」。

**3. 类型一致性：**
- `dot`/`vecNorm`（T1.1）被 `store.ts`（T1.2/T1.3）与 `scoreMemory` 同文件引用。
- `scoreMemory`/`ScoreInput`（T2.1）被 `recall` 向量分支（T2.2/T3.2）引用，字段名 `sim/createdAt/lastUsedAt/useCount/now` 一致。
- `RecallFilters`（T1.3）被 `index.ts` `recallMerged`/`memory_recall`（T1.4）引用，字段 `categories/from/to` 与工具参数 `categories/since/until` 的映射在 T1.4 步骤 2 完成。
- `MemoryRow` 增 `lastUsedAt?/useCount?`（T3.1）被 `recall`（T3.2）读取。

**4. 向后兼容：**
- `recall` 第 5 参 `filters?` 可选；`consolidate.ts` 既有 4 参调用不受影响。
- `memory_recall` 新增参数全 `Type.Optional`，旧调用行为不变。
- 关键词（无 key）路径排序逻辑保持原样，仅叠加 SQL 过滤。

> 刻意约定并记录：**加权排序（recency/usage）仅作用于向量召回路径**；关键词兜底路径维持 `keywordScore` 原排序，避免无 key 环境的行为漂移（T2.2 步骤 2 决策）。

---

## 执行交接

计划已保存到 `tauri-agent/docs/superpowers/plans/2026-06-15-memory-retrieval-plan.md`，设计见 `docs/superpowers/specs/2026-06-15-memory-retrieval-design.md`。

本仓库**禁止子代理**，采用**内联执行**：
- **必需子技能：** `superpowers:executing-plans`
- 顺序：**P1（T1.1→T1.5）→ P2（T2.1→T2.2）→ P3（T3.1→T3.3）**，每任务末尾 commit。
- 验证检查点：T1.5 / T3.3 的 `build:sidecar` + 全量单测。
- 阶段可分批合并：P1 单独即带来「过滤 + 消除重复解码」价值，可先行合并。

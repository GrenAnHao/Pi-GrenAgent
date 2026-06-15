# 设置热更新实现计划 — 运行时配置通道 / MCP 与值类动态生效

> **面向 AI 代理的工作者：** 用 `superpowers:executing-plans` 逐任务**内联**实现（本仓库**禁止子代理**）。复选框 `- [ ]` 跟踪，每任务末尾 commit。

**目标：** 设置改动即时生效、不重启 sidecar。通道 = 后端写 `runtime-settings.json` + 扩展共享模块 `fs.watch`。设计依据：`docs/superpowers/specs/2026-06-15-settings-hot-reload-design.md`。

**三阶段：** P1 通道+MCP热更新 → P2 值类运行时读 → P3 前端即时落盘。

**命令约定：**
- 扩展单测：`cd extensions && npx vitest run <相对路径>`
- 前端单测：`cd tauri-agent && npx vitest run <相对路径>`
- Rust 单测：`cd tauri-agent/src-tauri && cargo test <name>`
- 集成构建：`cd tauri-agent && npm run build:sidecar`（sidecar）/ `npm run build`（前端）

> **STOP 条件：** 扩展/前端 vitest 找不到改 `npx -y vitest`；`cargo test` 若因环境（无 rust 工具链）失败，停止报告、以纯函数单测为准，不要改 Cargo 配置。

---

## 文件结构

**新增**
- `extensions/_shared/runtime-config.ts` — getConfig/getAllConfig/watchConfig（内部 auto-watch）
- `extensions/_shared/runtime-config.test.ts` — 读取/回退单测
- `extensions/mcp/diff.ts` — `diffServers` 纯函数（增删改）
- `extensions/mcp/diff.test.ts`

**修改**
- 后端：`src-tauri/src/state/store.rs`（写 runtime file 方法）、`src-tauri/src/commands/agent.rs`（`set_settings` 写 file）、`src-tauri/src/pi/sidecar.rs`（注入 `PI_RUNTIME_CONFIG`）、`src-tauri/src/commands/agent.rs`(`open_workspace` 传 path)
- `extensions/mcp/index.ts`（watch + 增删改）
- 值类扩展（P2）：`long-term-memory` / `knowledge-rag` / `web-search` / `web-fetch` / `tts` / `image-gen` / `safety` / `multi-agent`
- 前端（P3）：`src/features/settings/settingsSchema.ts`（effect 字段）、`useSettingsForm.ts`（即时落盘）、`SettingsPanel.tsx`（去重启+标注）

---

# 阶段 P1 — 运行时配置通道 + MCP 热更新

## 任务 P1.1：`runtime-config.ts` 共享模块 + 单测

**文件**：创建 `extensions/_shared/runtime-config.ts` + `extensions/_shared/runtime-config.test.ts`

- [ ] **步骤 1：写失败测试**

创建 `extensions/_shared/runtime-config.test.ts`：

```ts
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getConfig, getAllConfig, __resetForTest } from "./runtime-config.js";

const dirs: string[] = [];
function fileWith(obj: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "rtcfg-"));
  dirs.push(dir);
  const p = join(dir, "runtime-settings.json");
  writeFileSync(p, JSON.stringify(obj));
  return p;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  delete process.env.PI_RUNTIME_CONFIG;
  delete process.env.SOME_KEY;
  __resetForTest();
});

describe("runtime-config", () => {
  it("reads value from runtime file", () => {
    process.env.PI_RUNTIME_CONFIG = fileWith({ SOME_KEY: "from-file" });
    expect(getConfig("SOME_KEY")).toBe("from-file");
  });
  it("falls back to process.env when file missing key", () => {
    process.env.PI_RUNTIME_CONFIG = fileWith({});
    process.env.SOME_KEY = "from-env";
    expect(getConfig("SOME_KEY")).toBe("from-env");
  });
  it("falls back to process.env when no PI_RUNTIME_CONFIG", () => {
    process.env.SOME_KEY = "env-only";
    expect(getConfig("SOME_KEY")).toBe("env-only");
  });
  it("getAllConfig merges env + file (file wins)", () => {
    process.env.SOME_KEY = "env";
    process.env.PI_RUNTIME_CONFIG = fileWith({ SOME_KEY: "file" });
    expect(getAllConfig().SOME_KEY).toBe("file");
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

`cd extensions && npx vitest run _shared/runtime-config.test.ts` — 预期 FAIL（模块不存在）。

- [ ] **步骤 3：实现 `runtime-config.ts`**

```ts
// 运行时配置：优先读 PI_RUNTIME_CONFIG 指向的 JSON（热更新源），回退 process.env。
// 进程内单例 + 内部 fs.watch 维护缓存，因此 getConfig 总读到最新值。
import { readFileSync, watch } from "node:fs";

let cache: Record<string, string> | null = null;
let started = false;
const subscribers = new Set<(next: Record<string, string>) => void>();

function configPath(): string | undefined {
  const p = process.env.PI_RUNTIME_CONFIG;
  return p && p.length > 0 ? p : undefined;
}

function read(): Record<string, string> {
  const p = configPath();
  if (!p) return {};
  try {
    const parsed = JSON.parse(readFileSync(p, "utf8")) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function ensureStarted(): void {
  if (started) return;
  started = true;
  cache = read();
  const p = configPath();
  if (!p) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    watch(p, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        cache = read();
        for (const cb of subscribers) {
          try {
            cb(cache as Record<string, string>);
          } catch {
            /* subscriber error isolated */
          }
        }
      }, 150);
    });
  } catch {
    // watch 不可用：cache 保持首次读 + env 回退（仍可用，只是不热更新）
  }
}

export function getConfig(key: string): string | undefined {
  ensureStarted();
  return cache?.[key] ?? process.env[key];
}

export function getAllConfig(): Record<string, string> {
  ensureStarted();
  return { ...(process.env as Record<string, string>), ...(cache ?? {}) };
}

export function watchConfig(onChange: (next: Record<string, string>) => void): () => void {
  ensureStarted();
  subscribers.add(onChange);
  return () => subscribers.delete(onChange);
}

/** 仅测试用：重置单例状态。 */
export function __resetForTest(): void {
  cache = null;
  started = false;
  subscribers.clear();
}
```

- [ ] **步骤 4：运行测试验证通过**

`cd extensions && npx vitest run _shared/runtime-config.test.ts` — 预期 PASS（4 用例）。

- [ ] **步骤 5：Commit**

```bash
git add extensions/_shared/runtime-config.ts extensions/_shared/runtime-config.test.ts
git commit -m "feat(settings): runtime-config shared module (file + env fallback + watch)"
```

## 任务 P1.2：后端写 `runtime-settings.json`

**文件**：修改 `src-tauri/src/state/store.rs`、`src-tauri/src/commands/agent.rs`

- [ ] **步骤 1：`AppStateStore` 加运行时配置路径 + 写方法**

`store.rs` 的 `AppStateStore` 结构加字段 `runtime_path: PathBuf`；`new` 接收它（或在 `new` 内由 app data 目录推导）。追加方法：

```rust
    /// 把当前 settings_env 写到运行时配置文件（原子写），供 sidecar 扩展 fs.watch 热更新。
    pub async fn write_runtime_config(&self) {
        let env = self.settings_env().await;
        let path = self.runtime_path.clone();
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        match serde_json::to_string_pretty(&env) {
            Ok(json) => {
                let tmp = path.with_extension("json.tmp");
                if std::fs::write(&tmp, json).is_ok() {
                    let _ = std::fs::rename(&tmp, &path);
                }
            }
            Err(e) => eprintln!("[runtime-config] serialize failed: {e}"),
        }
    }

    pub fn runtime_path(&self) -> std::path::PathBuf {
        self.runtime_path.clone()
    }
```

`new` 改为（路径取 `~/.pi/agent/runtime-settings.json`，与 global memory db 同目录）：

```rust
    pub fn new(path: PathBuf) -> Self {
        let state = AppState::load(&path);
        let runtime_path = dirs::home_dir()
            .unwrap_or_default()
            .join(".pi")
            .join("agent")
            .join("runtime-settings.json");
        Self {
            inner: Arc::new(Mutex::new(state)),
            path,
            runtime_path,
        }
    }
```

> 若 `dirs` crate 不可用，用 `std::env::var("HOME")`/`USERPROFILE` 兜底（实现期按现有依赖确认；`app-state` 已有路径管理可复用）。STOP 条件：若 `dirs` 不在 Cargo.toml，改用 env var 推导，不新增依赖除非必要。

- [ ] **步骤 2：`set_settings` 命令写 runtime file（`agent.rs:399`）**

```rust
#[tauri::command]
pub async fn set_settings(
    settings: std::collections::HashMap<String, String>,
    store: State<'_, AppStateStore>,
) -> Result<(), String> {
    store.replace_settings(settings).await;
    store.write_runtime_config().await;
    Ok(())
}
```

- [ ] **步骤 3：应用启动时初始化一次 runtime file**

在 `AppStateStore` 初始化后（`lib.rs`/`main.rs` setup 处，实现期定位）调用一次 `store.write_runtime_config().await`，保证文件存在（即便用户没改设置）。

- [ ] **步骤 4：Rust 编译**

`cd tauri-agent && npm run build:sidecar` 不涉及 Rust；用 `cd tauri-agent/src-tauri && cargo build` 验证编译（若有 rust 工具链）。STOP：无 rust 工具链则跳过、在 P1.5 集成时验证。

- [ ] **步骤 5：Commit**

```bash
git add tauri-agent/src-tauri/src/state/store.rs tauri-agent/src-tauri/src/commands/agent.rs
git commit -m "feat(settings): write runtime-settings.json on set_settings"
```

## 任务 P1.3：spawn 注入 `PI_RUNTIME_CONFIG`

**文件**：修改 `src-tauri/src/pi/sidecar.rs`、`src-tauri/src/commands/agent.rs`(`open_workspace`)

- [ ] **步骤 1：`spawn_pi_client` 注入路径**

`sidecar.rs` 的 `.env("PI_PACKAGE_DIR", &package_dir)` 之后追加（路径由调用方传入，签名加参数 `runtime_config: &str`）：

```rust
        .env("PI_RUNTIME_CONFIG", runtime_config)
```

`spawn_pi_client` 签名加 `runtime_config: &str` 参数。

- [ ] **步骤 2：`open_workspace` 传路径（`agent.rs:72-76`）**

```rust
    let env = store.settings_env().await;
    let runtime_config = store.runtime_path().to_string_lossy().to_string();
    mgr.get_or_open(&workspace, move || {
        let sink: Arc<dyn EventSink> = Arc::new(TauriSink { app: app2.clone() });
        spawn_pi_client(&app2, ws.clone(), &cwd_for_spawn, sink, env.clone(), &runtime_config)
    })
```

- [ ] **步骤 3：编译验证**

`cd tauri-agent/src-tauri && cargo build`（有工具链时）。STOP：无则 P1.5 集成验证。

- [ ] **步骤 4：Commit**

```bash
git add tauri-agent/src-tauri/src/pi/sidecar.rs tauri-agent/src-tauri/src/commands/agent.rs
git commit -m "feat(settings): inject PI_RUNTIME_CONFIG into sidecar spawn"
```

## 任务 P1.4：MCP 扩展 diff + 热更新

**文件**：创建 `extensions/mcp/diff.ts` + `diff.test.ts`；修改 `extensions/mcp/index.ts`

- [ ] **步骤 1：写 diff 失败测试**

创建 `extensions/mcp/diff.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { diffServers } from "./diff.js";
import type { McpServerConfig } from "./config.js";

const s = (name: string, command = "x"): McpServerConfig => ({ name, transport: "stdio", command, args: [] });

describe("diffServers", () => {
  it("detects added", () => {
    const d = diffServers([s("a")], [s("a"), s("b")]);
    expect(d.added.map((x) => x.name)).toEqual(["b"]);
    expect(d.removed).toEqual([]);
    expect(d.changed).toEqual([]);
  });
  it("detects removed", () => {
    const d = diffServers([s("a"), s("b")], [s("a")]);
    expect(d.removed).toEqual(["b"]);
  });
  it("detects changed (command differs)", () => {
    const d = diffServers([s("a", "old")], [s("a", "new")]);
    expect(d.changed.map((x) => x.name)).toEqual(["a"]);
  });
  it("no change when identical", () => {
    const d = diffServers([s("a")], [s("a")]);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
    expect(d.changed).toEqual([]);
  });
});
```

- [ ] **步骤 2：运行验证失败**

`cd extensions && npx vitest run mcp/diff.test.ts` — 预期 FAIL。

- [ ] **步骤 3：实现 `diff.ts`**

```ts
import type { McpServerConfig } from "./config.js";

export interface ServerDiff {
  added: McpServerConfig[];
  removed: string[]; // names
  changed: McpServerConfig[]; // 配置变化（需先删后加）
}

function sig(s: McpServerConfig): string {
  return JSON.stringify({ t: s.transport, c: s.command, a: s.args, u: s.url, e: s.env });
}

export function diffServers(prev: McpServerConfig[], next: McpServerConfig[]): ServerDiff {
  const prevByName = new Map(prev.map((s) => [s.name, s]));
  const nextByName = new Map(next.map((s) => [s.name, s]));
  const added: McpServerConfig[] = [];
  const changed: McpServerConfig[] = [];
  for (const s of next) {
    const p = prevByName.get(s.name);
    if (!p) added.push(s);
    else if (sig(p) !== sig(s)) changed.push(s);
  }
  const removed = prev.filter((s) => !nextByName.has(s.name)).map((s) => s.name);
  return { added, removed, changed };
}
```

- [ ] **步骤 4：运行验证通过**

`cd extensions && npx vitest run mcp/diff.test.ts` — 预期 PASS（4 用例）。

- [ ] **步骤 5：`index.ts` 接入 watch + 增删改**

在 `extensions/mcp/index.ts`：
- 顶部 import：`import { getConfig, watchConfig } from "../_shared/runtime-config.js";` 和 `import { diffServers } from "./diff.js";`
- 把读取从 `process.env.MCP_SERVERS` 改为 `getConfig("MCP_SERVERS")`（启动初值）。
- 重构 `connectServer` 使其可被复用于"新增"。新增"断开单个 server"逻辑：记录每个 server 的 `client` 与 `toolNames`，删除时 `client.close()` + `setActiveTools(active - toolNames)`。
- 维护 `currentServers: McpServerConfig[]`。在首次连接后 `watchConfig`：

```ts
  watchConfig((next) => {
    const desired = injectDefaultServers(parseMcpServers(next.MCP_SERVERS ?? ""), process.env, process.platform);
    const { added, removed, changed } = diffServers(currentServers, desired);
    for (const name of [...removed, ...changed.map((c) => c.name)]) void disconnectServer(name);
    for (const s of [...added, ...changed]) void connectServer(s);
    currentServers = desired;
  });
```

其中 `disconnectServer(name)`：取该 server 的 client/toolNames → `client.close()` → `pi.setActiveTools(getActiveTools().filter(t => !toolNames.includes(t)))` → 从 registry map 删除 → `pushStatus?.()`。

> 说明：真实连接/断开是 I/O，不单测（靠 P1.5 冒烟）；`diffServers` 纯函数已覆盖。`registerTool` 同名覆盖，changed 走"先断后连"。

- [ ] **步骤 6：Commit**

```bash
git add extensions/mcp/diff.ts extensions/mcp/diff.test.ts extensions/mcp/index.ts
git commit -m "feat(mcp): hot add/remove/update servers via runtime-config watch"
```

## 任务 P1.5：集成构建 + MCP 热更新冒烟

- [ ] **步骤 1：扩展单测**

`cd extensions && npx vitest run _shared/runtime-config.test.ts mcp/diff.test.ts` — 全绿。

- [ ] **步骤 2：集成构建**

`cd tauri-agent && npm run build:sidecar` — 成功。

- [ ] **步骤 3：手动冒烟**

启动 app（或 sidecar RPC + 手写 runtime-settings.json）。改 `MCP_SERVERS` 加一个 server → 不重启 → 该 server 工具在几秒内出现（`ctx.ui.setStatus("mcp")` 状态变 connected）；删除 → 工具消失。
> STOP 条件：若工具不热更新，确认 `PI_RUNTIME_CONFIG` 已注入（sidecar 环境）、文件被原子写、`watchConfig` 触发。

P1 完成 —— MCP 配置改动不重启即生效。

---

# 阶段 P2 — 值类设置运行时读

> 改造模式：把扩展里**模块加载时读的 env 常量**改成**使用点调用 `getConfig`**。模式如下，对每个扩展按其 key 清单套用。纯计算/分支保持不变。

**通用改造模式**（以一个 boolean 开关为例）：

```ts
// 改造前（模块顶层常量，加载时固定）：
const AUTO_INJECT = (process.env.MEMORY_AUTO_INJECT ?? "1") !== "0";
// 用处： if (AUTO_INJECT) {...}

// 改造后（运行时读）：
import { getConfig } from "../_shared/runtime-config.js";
const autoInject = () => (getConfig("MEMORY_AUTO_INJECT") ?? "1") !== "0";
// 用处： if (autoInject()) {...}
```

每个扩展一个任务，步骤统一：① 加 `getConfig` import；② 把该扩展的 env 常量改成 getter 函数并更新调用点；③ `cd extensions && npx vitest run <ext>`（现有测试不回归，多数扩展用 OFF/注入式测试不受影响）；④ commit `refactor(<ext>): read settings at runtime via getConfig`。

## 任务 P2.1：`long-term-memory`
key 清单：`MEMORY_AUTO_INJECT` `MEMORY_AUTO_TOPK` `MEMORY_AUTO_CAPTURE` `MEMORY_EXTRACT` `MEMORY_SMART` `MEMORY_SMART_NOTICE` `MEMORY_MODEL`（`MEMORY_EMBED_*` 经 `resolveEmbeddingConfig` 已是函数内读取——把其内部 `process.env` 改 `getConfig` 即可）。
- [ ] 改 `index.ts` 顶层常量 → getter；`embedding.ts::resolveEmbeddingConfig` 内 `process.env.*` → `getConfig`。
- [ ] `cd extensions && npx vitest run long-term-memory/` 全绿（现有 26 用例用 OFF/注入，不受影响）。
- [ ] commit。
> 例外：`MEMORY_GLOBAL_DB`（启动建立 db 路径）**不改**——属 restart 类，保持启动读。

## 任务 P2.2：`knowledge-rag`
key：`KB_AUTO_INJECT` `KB_AUTO_TOPK` `KB_EMBED_API_KEY` `KB_EMBED_BASE_URL` `KB_EMBED_MODEL`（embedding 配置函数内读）。
- [ ] 改 env 常量 → getter；embedding 解析内 `process.env` → `getConfig`。
- [ ] `cd extensions && npx vitest run knowledge-rag/` 全绿。
- [ ] commit。

## 任务 P2.3：`web-search` + `web-fetch`
key：`WEB_SEARCH_PROVIDER` `WEB_SEARCH_ENGINES` `TAVILY_API_KEY` `BRAVE_API_KEY` `OPEN_WEBSEARCH` / `FETCH_MAX_CHARS` `FETCH_TIMEOUT_MS`。
- [ ] 两扩展 env 常量 → getter（搜索每次执行读最新 provider/链）。
- [ ] `cd extensions && npx vitest run web-search/ web-fetch/` 全绿。
- [ ] commit。

## 任务 P2.4：`tts` + `image-gen`
key：`TTS_API_KEY/BASE_URL/MODEL/VOICE/FORMAT` / `IMAGE_API_KEY/BASE_URL/MODEL/SIZE`。
- [ ] env 常量 → getter（每次合成/生成读）。
- [ ] `cd extensions && npx vitest run tts/ image-gen/` 全绿（如有测试）。
- [ ] commit。

## 任务 P2.5：`safety` + `multi-agent`
key：`SAFETY_BASH_CONFIRM` `SAFETY_PROTECT_PATHS`（+ 已有 `SAFETY_READONLY/WRITE_ALLOW` 若存在） / `SUBAGENT_MODEL` `SUBAGENT_TIMEOUT_MS` `PI_BIN`。
- [ ] safety `tool_call` 钩子内改 `getConfig`（每次工具调用读，天然热更新）；multi-agent spawn 处改 `getConfig`。
- [ ] `cd extensions && npx vitest run safety/ multi-agent/` 全绿。
- [ ] commit。

## 任务 P2.6：集成构建
- [ ] `cd extensions && npx vitest run`（全量扩展单测，绿）。
- [ ] `cd tauri-agent && npm run build:sidecar` 成功。

P2 完成 —— 值类设置改动不重启即生效。

---

# 阶段 P3 — 前端即时落盘 + 生效标注

## 任务 P3.1：schema 加 `effect` 字段
**文件**：`src/features/settings/settingsSchema.ts` + `settingsSchema.test.ts`
- [ ] **步骤 1**：`SettingField` 加 `effect?: 'instant' | 'hot' | 'restart'`（默认视为 `'hot'`）。给 `titleModel` 标 `effect: 'instant'`；`MEMORY_GLOBAL_DB`(若在 schema) 等启动建立类标 `'restart'`（当前 schema 无该项，跳过）。
- [ ] **步骤 2**：`settingsSchema.test.ts` 加断言：`titleModel.effect === 'instant'`。
- [ ] **步骤 3**：`cd tauri-agent && npx vitest run src/features/settings/settingsSchema.test.ts` 绿。
- [ ] commit `feat(settings): add effect field (instant/hot/restart)`。

## 任务 P3.2：`useSettingsForm` 即时落盘
**文件**：`src/features/settings/useSettingsForm.ts`
- [ ] **步骤 1**：加防抖自动 `persist`（`setValue` 后防抖调 `pi.setSettings`，复用现有 `persist`）。保留 `save`（仅在有 `restart` 类改动时用，触发 close/open）。
- [ ] **步骤 2**：`useSettingsForm.test.ts` 更新：改值后防抖触发 `setSettings`（用 fake timers 验证）。
- [ ] **步骤 3**：`cd tauri-agent && npx vitest run src/features/settings/useSettingsForm.test.ts` 绿。
- [ ] commit `feat(settings): debounced autosave (hot settings apply without restart)`。

## 任务 P3.3：`SettingsPanel` 去重启 + 标注
**文件**：`src/features/settings/SettingsPanel.tsx` + `SettingsPanel.test.tsx`
- [ ] **步骤 1**：去掉常驻"保存并重启"按钮；改为：默认即时落盘；仅当存在 `restart` 类改动未生效时，顶部显示"重启生效"按钮（调用 `save`）。字段旁按 `effect` 显示小标记（即时/热更新/需重启）。
- [ ] **步骤 2**：`SettingsPanel.test.tsx` 更新：改 `titleModel` → 防抖后 `setSettings` 被调、无重启；（如有 restart 类）出现重启按钮。
- [ ] **步骤 3**：`cd tauri-agent && npx vitest run src/features/settings/` 全绿。
- [ ] commit `feat(settings): instant-apply UI with per-field effect badges`。

## 任务 P3.4：验证门
- [ ] `cd tauri-agent && npx vitest run src/features/settings/` + `npx tsc --noEmit` + `npm run build` 全绿。
- [ ] `cd extensions && npx vitest run` 全绿。

P3 完成 —— 设置即时落盘、热更新即时生效、UI 标注清晰。

---

## 自检结果

**1. 规格覆盖度**

| spec 章节 | 任务 | 状态 |
|-----------|------|------|
| §3.1/3.2 配置文件 + 后端写 | P1.2 | OK |
| §3.2 spawn 注入 PI_RUNTIME_CONFIG | P1.3 | OK |
| §3.3 runtime-config 模块（内部 watch + getConfig + watchConfig） | P1.1 | OK |
| §4.1 MCP 增删改 | P1.4 | OK |
| §4.2 值类运行时读 | P2.1–P2.5 | OK |
| §4.3 启动建立类不改（MEMORY_GLOBAL_DB） | P2.1 例外说明 | OK |
| §5 前端即时落盘 + effect 三态 | P3.1–P3.3 | OK |

**2. 占位符扫描**：无 TODO；P1 全含完整代码；P2 给完整改造模式 + 每扩展精确 key 清单（机械套用，非占位）。

**3. 类型/契约一致性**：
- `getConfig/getAllConfig/watchConfig/__resetForTest`（P1.1）被 mcp（P1.4）+ 值类（P2）引用。
- `diffServers`/`ServerDiff`（P1.4）被 index.ts watch 回调引用。
- `PI_RUNTIME_CONFIG` 由后端注入（P1.3）→ 模块读取（P1.1）。
- `runtime_path()`/`write_runtime_config()`（P1.2）被 set_settings + open_workspace 引用。
- `effect` 字段（P3.1）被 SettingsPanel 标注（P3.3）引用。

**4. 向后兼容**：
- env 注入保留，runtime file 缺失/watch 失败 → `getConfig` 回退 `process.env`（零回归）。
- 值类扩展现有测试用 OFF/注入 config，不读 `getConfig`（getConfig 仅在扩展运行逻辑里），测试不受影响。
- `MEMORY_GLOBAL_DB` 等启动建立类保持原样。

> 关键约束记录：P1 是地基（通道），P2/P3 都依赖 P1.1 的 `runtime-config`；P1.2/P1.3 是 Rust 改动，若本机无 rust 工具链，cargo 验证延后到能构建的环境，TS 侧（P1.1/P1.4/P2/P3）单测可独立验证。

---

## 执行交接

计划保存在 `tauri-agent/docs/superpowers/plans/2026-06-15-settings-hot-reload-plan.md`，设计见同名 specs。

本仓库**禁止子代理**，**内联执行**：
- **必需子技能**：`superpowers:executing-plans`
- 顺序：P1（P1.1→P1.5）→ P2（P2.1→P2.6）→ P3（P3.1→P3.4），每任务末尾 commit。
- 验证门：P1.5（MCP 热更新冒烟）、P2.6、P3.4。
- P1 可独立合并（MCP 热更新已是完整价值）。

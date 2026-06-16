# 代码智能内置（Code Intelligence Built-in）设计

- 日期：2026-06-17
- 状态：设计已评审（待用户最终确认 → writing-plans）
- 主题：把 CodeGraph、GitNexus、FastContext 三个库的能力以「内置」形态融入 Hermes（Pi 桌面 agent）

## 1. 背景与目标

调研了三个库：

- **CodeGraph**（colbymchenry/codegraph）：预索引代码知识图谱 MCP，tree-sitter + SQLite + FTS5，文件变更自动增量同步，100% 本地、无向量、无外部模型。README 明确支持 Hermes Agent，工具名（`codegraph_explore/search/callers/node/status/files`）与当前 `user-codegraph` MCP 完全一致——即当前在用的引擎。
- **GitNexus**（abhigyanpatwari/GitNexus）：同类但更重的代码知识图谱引擎，额外有 Leiden 聚类、执行流 processes、Cypher、多仓 group、Wiki、Web UI、可选本地向量（transformers.js）。有 `pi-gitnexus` 插件。
- **FastContext**（microsoft/fastcontext）：训练出的只读「探仓子代理」。主 agent 委托自然语言查询，它用 Read/Glob/Grep 并行探索、只回 `文件:行号` 紧凑引用，把探索与解题分离，主 agent token 最多省 60.3%。

### 成功标准（用户确认，全选）

1. **完全离线自包含**：引擎不依赖 npx/网络/外部模型，随 app 打包本地跑。
2. **开箱即用**：装了 Hermes 就有代码智能，零配置零安装，索引/同步/MCP 由 app 托管。
3. **省 token / 工具调用**：让 agent 少 grep/读文件、压缩上下文窗口。
4. **可视化 / 可管理 UI**：能看索引状态、手动 init/同步、开关工具、切换引擎。

### 关键决策（来自评审问答）

- 三个库一并设计为一个 umbrella，拆成「1 份地基 + 3 份子规格」，各自可独立交付。
- 集成方式选 **方案 A**：捆绑二进制 + 默认 MCP 注入 + 原生探索子代理（复用现有 paved path）。
- **CodeGraph = 默认主引擎**（已支持 Hermes、100% 本地无模型、轻、可完全离线打包）。
- **GitNexus = 可选高级引擎**，与 CodeGraph 互斥可切换；因原生依赖较重，其完全离线打包作为 opt-in（启用时准备），是「严格离线」的唯一例外。
- **FastContext = 只取其模式**：只读探索子代理，复用 Hermes 已配置的模型（便宜/快档位），不引入新模型、不额外 serving。

### 非目标

- 不在 Pi 内原生重写图谱引擎（方案 B 工作量过大）。
- 不把 CodeGraph 当库直接嵌进 bun 编译的 sidecar（方案 C 原生依赖与打包冲突、风险高）。
- 不捆绑/serving FastContext 的训练权重（与「不依赖外部模型/离线」冲突，且非必要）。

## 2. 架构总览

```
主 agent
  └─(tool) explore_context(query)
        └─ context-explorer 子代理（只读、独立上下文、便宜模型档位）
              ├─ codegraph_explore/search/callers/node ...（首选：预建索引）
              └─ Read / Glob / Grep（补充）
                    └─ 返回 <final_answer> 紧凑 文件:行号 引用 → 回主 agent

代码图谱引擎（默认 CodeGraph，可切 GitNexus）
  = 捆绑二进制（src-tauri/binaries/codegraph-<triple>）
  → 默认 MCP 注入（injectDefaultServers，命令指向捆绑二进制，离线）
  → 每个 workspace 自动 init → 引擎自带 watcher 自动同步
  → .codegraph SQLite + FTS5
```

数据流：`主 agent → context-explorer 子代理 → codegraph MCP（捆绑、离线）→ .codegraph SQLite`。三库在此组合：CodeGraph（索引底座）← FastContext（探索模式）← GitNexus（可替换引擎）。

## 3. 子规格拆分

| 子规格 | 范围 | 可独立交付 |
| --- | --- | --- |
| Spec 0 · 地基/横切 | 引擎抽象、离线捆绑、默认 MCP 注入、覆盖/让位策略、配置键、引擎切换 | 是（前置） |
| Spec 1 · 内置代码图谱引擎 | 捆绑 CodeGraph 二进制、自动 init、自动同步、GitNexus opt-in | 依赖 Spec 0 |
| Spec 2 · Context-Explorer 探索子代理 | 复用 multi-agent 的只读 capability、`explore_context` 工具、引用产物、模型档位 | 依赖 Spec 1（可降级独立） |
| Spec 3 · Code Intelligence 管理 UI | ExtensionsPanel 第三个 tab、Rust 状态命令、前端 io | 依赖 Spec 0/1/2 |

## 4. Spec 0 · 地基 / 横切

### 配置键（settings store，与 `SKILLS_DISABLED`/`OPEN_WEBSEARCH` 同处）

- `CODE_INTEL` = `codegraph` | `gitnexus` | `off`（默认 `codegraph`）——当前激活引擎。
- `CODE_INTEL_AUTO_INIT` = `1`|`0`（默认 `1`）——workspace 打开时自动建索引。
- `CODE_INTEL_EXPLORER` = `1`|`0`（默认 `1`）——是否启用探索子代理与 `explore_context` 工具。
- `CODEGRAPH_MCP_TOOLS`（可选）——透传给引擎，控制暴露哪些工具。

### 引擎抽象

`extensions/code-intel/engines.ts`：每个引擎声明 `{ serverName, toolPrefix, buildConfig(pkgDir, platform) -> McpServerConfig }`。纯函数、无 I/O，便于测试；让 CodeGraph/GitNexus 可互换。

### 默认 MCP 注入（扩展现有 `injectDefaultServers`）

- 读 `CODE_INTEL`（默认 `codegraph`）；`off` → 跳过。
- 以规范名（`codegraph`/`gitnexus`）注入，`command` = `join(PI_PACKAGE_DIR, "codegraph"+ext)`，`args = ["serve","--mcp"]`。
- **让位策略**（回应「用户自己又加了对应 MCP」）：
  1. 同名跳过（主）：用户 `MCP_SERVERS` 已有同名 server → 不注入（与 `open-websearch` 现有逻辑一致，用户配置优先）。
  2. 签名识别（次）：用户用别的名字但暴露 `codegraph_*` 工具 / 命令指向 codegraph 二进制 → 自动抑制内置，避免双引擎重复索引。
  3. UI 显式开关 + 徽标：面板标明当前是「内置(bundled)」还是「已检测到你自配 codegraph，内置已让位」。
- 说明：pi 的 MCP 工具名是 `mcp__<server>__<tool>`，server 名是 id 一部分，故两个 server 不会硬撞名；让位的真正目的是避免「双引擎冗余索引」。

### 引擎切换

改 `CODE_INTEL` → 经 MCP manager 现有的 config-watch（`onConfigChange`/`defaultReadServers` 重读）热切换：断开旧引擎 server、连接新引擎，无需重建 app。

## 5. Spec 1 · 内置代码图谱引擎

### 离线捆绑

- 把 CodeGraph 自包含的逐平台二进制 vendor 进 `tauri-agent/src-tauri/binaries/codegraph-<triple>(.exe)`，与现有 `pi-<triple>` 并列。
- 扩展构建步骤（`build-sidecar.mjs` 或新 `build-codegraph.mjs`）在 build 期拉取 pin 住的 release 二进制并放入；`tauri.conf.json` 的 `externalBin` 增加 `binaries/codegraph`。
- 运行期：sidecar 已有 `PI_PACKAGE_DIR` 指向 `binaries/`，注入的 MCP `command` 据此解析二进制绝对路径 → 完全离线、无 npx。

### 自动 init / 同步

- `open_workspace` 流程中：若 `CODE_INTEL_AUTO_INIT=1` 且无 `.codegraph/`，对捆绑二进制跑一次 `init`（非阻塞，复用 `probe-mcp` 那种一次性子命令模式）。
- init 后由引擎自带的原生文件 watcher 增量自动同步；未初始化时 MCP server 处于其文档化的「inactive、零工具」状态，init 即激活。

### GitNexus（opt-in 高级引擎）

- 因原生依赖（LadybugDB、tree-sitter 原生绑定 / 可选向量），默认不打包；用户在 UI 选 GitNexus 时触发首次「准备/下载」。这是严格离线的唯一例外，UI 明确提示。
- 选 GitNexus 时其增量能力（聚类/执行流/Cypher/多仓/Wiki）随之可用；与 CodeGraph 互斥。

## 6. Spec 2 · Context-Explorer 探索子代理

### 落点

复用 `multi-agent`：新增一个内置**只读 capability 档位** `context-explorer`，复用 `multi-agent/runner` + `capability`，不新增运行时。

### capability 档位

- `fs: read-only`；工具白名单 = `Read`、`Glob`、`Grep` + 当前引擎工具（`codegraph_explore/search/callers/node/...`）。无 write、无 bash。
- 开启并行工具调用。
- 模型：在现有 capability→model 预设 UI（`capabilityModelPresets.ts` / `CapabilityModelField.tsx`）中新增一个档位条目，跑便宜/快模型，复用用户已配 provider，不引入新模型。

### 调用契约

- 给主 agent 暴露一个工具 `explore_context({ query, max_turns? })`（默认约 6 轮）。它在**独立上下文窗口**里跑只读子代理，探索后只回 `<final_answer>`：紧凑 `path:start-end` 引用（每条一句说明）。
- 主 agent 经 MCP/指令引导：遇到 where/how/find 类仓库问题优先调 `explore_context`，而不是自己 grep。

### Token 机制

探索 token 留在子代理窗口，只有紧凑引用回主 agent —— 即 FastContext 的「探索/解题分离」，直接服务「省 token / 压缩」目标。

### system prompt

改编自 FastContext `system.md`：只读探索、并行工具、优先 `codegraph_explore`（预建索引，一次到位），再用 Glob/Grep/Read 补缺，最后输出 `<final_answer>` 引用块。

### 降级

`CODE_INTEL=off` 或索引未建时，探索子代理仍以 Read/Glob/Grep 工作（FastContext 基线），不硬失败。

## 7. Spec 3 · Code Intelligence 管理 UI

### 落点

`ExtensionsPanel.tsx` 第三个 tab：`插件 / 技能 / 代码智能`。复用 tab 栏、卡片样式、`Switch`、`Popconfirm`、settings-form 自动存盘 +「重启生效」机制。

### 分区

1. **引擎**：CodeGraph / GitNexus / Off 选择器 → 写 `CODE_INTEL`；徽标显示「内置(bundled)」或「已检测到你自配 codegraph，内置已让位」；GitNexus 未准备时显示「准备/下载」。
2. **索引（当前 workspace）**：状态（未初始化/索引中/就绪/待同步）+ 节点/文件数（取 `codegraph status`）；按钮 `初始化`/`手动同步`/`重建`；`CODE_INTEL_AUTO_INIT` 开关。
3. **探索子代理**：`CODE_INTEL_EXPLORER` 开关 + 探索 capability 的模型选择（复用 `CapabilityModelField`）。
4. **工具**：从 tools cache 列出引擎 MCP 工具，复用现有 per-tool 权限 UI（`mcpPolicy`）；用 `CODEGRAPH_MCP_TOOLS` 切换暴露。

### 后端 / 数据

- 新 Rust 命令 `code_intel_status/init/sync/reindex(workspace)`：各自一次性 spawn 捆绑二进制（同 `probe_mcp_server` 模式），返回解析后的状态。
- 新前端 lib `lib/codeIntelIo.ts` 包装 invoke；引擎/配置经现有 `get/set_settings` + `useSettingsForm`。
- 让位徽标：由 `MCP_SERVERS` + tools cache 推断是否存在用户自配 codegraph。

### 重启语义

引擎切换 / 工具开关 / 探索模型经 MCP config-watch 热生效；索引 init/sync 为运行时；仅 GitNexus 首次准备是较重步骤。

## 8. 测试策略

- Spec 0：`engines.ts` 纯函数单测；`injectDefaultServers` 让位策略单测（同名跳过、签名识别、off）。
- Spec 1：构建脚本放置二进制的路径解析单测；自动 init 的「无 `.codegraph/` 才跑」幂等逻辑测试。
- Spec 2：capability 工具白名单/只读约束测试；`explore_context` 产物（`<final_answer>` 解析）测试；引擎关时降级到 grep 的测试。
- Spec 3：UI 渲染/开关/状态展示测试（沿用 `ExtensionsPanel.test.tsx` 模式，mock Rust 命令）。

## 9. 风险与权衡

- **二进制体积**：捆绑 codegraph 增大 app 体积；GitNexus 故 opt-in。
- **上游版本漂移**：pin release 版本；升级走构建脚本。
- **首屏/首次 init 时延**：init 非阻塞 + UI 状态提示；未建索引时引擎自报 inactive。
- **严格离线例外**：GitNexus 首次准备需网络，UI 明确告知。
- **平台覆盖**：需为各 target triple 提供 codegraph 二进制（Win/macOS/Linux × x64/arm64）。

## 10. 分期建议

1. Spec 0 + Spec 1（CodeGraph 默认引擎离线内置 + 自动 init）——交付即「开箱即用 + 离线 + 省 token 的图谱」。
2. Spec 2（探索子代理）——叠加「探索/解题分离」省上下文。
3. Spec 3（管理 UI）——补齐可视化/可管理。
4. GitNexus opt-in 与其增量能力——最后、可选。

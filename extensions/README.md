# Pi Extensions Pack

一组受 [LobeHub](https://github.com/lobehub/lobe-chat) 启发、为 [Pi coding agent](https://github.com/earendil-works/pi) 补齐能力的扩展。每个都**自包含**(可单独用),也可作为**一个 Pi Package** 一次性安装全部。

## 包含的 extension

| 目录 | 工具 / 命令 | 需要 key? | 说明 |
|---|---|---|---|
| [`knowledge-rag`](./knowledge-rag) | `kb_search` `kb_add` `/kb` | 可选(语义) | 本地知识库 RAG + 提问自动注入 |
| [`long-term-memory`](./long-term-memory) | `memory_save` `memory_recall` `/memory` | 可选(语义) | 两级长期记忆 + 自动召回 + 「记住:」自动捕获 |
| [`web-fetch`](./web-fetch) | `fetch_url` `fetch_html` `fetch_markdown` `fetch_txt` `fetch_json` | 否 | 网页抓取(SSRF 防护) |
| [`image-gen`](./image-gen) | `generate_image` | 是 | 文生图(OpenAI 兼容) |
| [`code-review`](./code-review) | `git_diff` `review_note` `/review` | 否 | 结构化代码审查 + 报告 |
| [`multi-agent`](./multi-agent) | `spawn_agent` | 子 agent 需 | 委派隔离 pi 子进程(单个/并行) |
| [`fable-behavior`](./fable-behavior) | — | 否 | Fable 5 + coding-agent 行为层(Tier 注入 + 子 agent 种子) |
| [`tts`](./tts) | `speak` | 是 | 文字转语音(OpenAI 兼容) |
| [`im-gateway`](./im-gateway) | `/imgateway` + webhook | 否 | HTTP 网关,接入 IM 平台 |

合计 **10 个工具 + 4 个命令**(8 个 extension)。

## 一键加载全部

```bash
# 方式 1:逐个 -e(开发调试)
pi -e ./extensions/knowledge-rag/index.ts \
   -e ./extensions/long-term-memory/index.ts \
   -e ./extensions/web-fetch/index.ts \
   -e ./extensions/image-gen/index.ts \
   -e ./extensions/code-review/index.ts \
   -e ./extensions/multi-agent/index.ts

# 方式 2:作为一个 Pi Package 安装(本目录已带聚合 package.json)
pi install git:github.com/<you>/<repo>     # 指向包含本 extensions/ 的仓库

# 方式 3:复制到自动发现目录
cp -r extensions/* ~/.pi/agent/extensions/
```

## 统一配置

配一个 `OPENAI_API_KEY` 即可同时启用语义检索 / 记忆 / 图像 / embedding(各 extension 也有独立的 `*_EMBED_*`、`IMAGE_*` 覆盖)。需要 key 的只有:`image-gen`(必需)、`knowledge-rag` / `long-term-memory`(可选,无 key 走关键词)、`multi-agent`(子 agent 实跑需 provider key)。

## 技术共性

- TypeScript extension,`typebox` schema,`registerTool` / `registerCommand` / 生命周期钩子。
- `node:sqlite` 本地持久化(knowledge / memory / review),embedding 存 Float32 BLOB,**零或极少第三方依赖**。
- knowledge-rag / long-term-memory 用 `before_agent_start` 做「提问自动检索/召回注入」。
- 关键词检索支持中英文(CJK 分词)。

## 测试

每个 extension 都有 jiti smoke 验证(累计 100+ 断言全过)。涉及真实 LLM 的回路(`spawn_agent` 实跑、真实 pi 端到端)需配 provider key 后体验。

## 注意

- 包名:按官方新名 `@earendil-works/*` + `typebox`(实测该 Pi 版本 bundle 的是 `typebox`,不是 `@sinclair/typebox`)。
- `node:sqlite` 是实验特性,首次加载打印一行 `ExperimentalWarning`,正常无害(需 Node ≥ 22.5)。

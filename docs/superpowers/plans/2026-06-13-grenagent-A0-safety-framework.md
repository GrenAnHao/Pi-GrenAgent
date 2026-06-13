# A0 安全/生命周期框架 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法跟踪进度。

**目标：** 为 GrenAgent/Pi 建立中档安全护栏（危险 bash 确认、写保护路径、项目信任、危险会话确认），并打通前端 extension 确认/选择弹窗；预留沙箱接口。

**架构：** 新增 `extensions/safety/`（纯规则函数 `rules.ts` + `index.ts` 用 `pi.on("tool_call")` 拦截）→ 注册进 `allExtensions` 编入 sidecar；前端补 `onPiUiRequest` 的弹窗渲染（confirm/select）与 `extension_ui_respond` 回传；设置面板加安全开关；定义 `SandboxAdapter` 接口（本期 Noop）。

**技术栈：** TypeScript、typebox、Pi ExtensionAPI（`pi.on`/`ctx.ui.select`/`ctx.hasUI`）、Tauri RPC（`pi://ui-request` / `extension_ui_respond`）、React、vitest。

**父 spec：** `docs/superpowers/specs/2026-06-13-grenagent-subproject-a-extensions-safety-design.md`

---

## 文件结构

- 创建 `extensions/safety/rules.ts` — 纯函数：`isDangerousBash`、`matchProtectedPath`、`extractPath`（无副作用，可单测）
- 创建 `extensions/safety/index.ts` — extension 入口：tool_call 拦截 + project_trust + 危险会话确认 + 读安全开关 env
- 创建 `extensions/safety/sandbox.ts` — `SandboxAdapter` 接口 + `NoopSandbox`（预留）
- 创建 `extensions/safety/rules.test.ts` — rules 单测
- 创建 `extensions/safety/package.json` — 含 vitest（对齐其它 extension）
- 修改 `extensions/index.ts` — 注册 `safety` 到 `allExtensions`
- 创建 `tauri-agent/src/features/extensionUi/ExtensionUiHost.tsx` — 监听 `onPiUiRequest`，渲染 confirm/select 弹窗，调用 `extensionUiRespond`
- 创建 `tauri-agent/src/features/extensionUi/ExtensionUiHost.test.tsx`
- 修改 `tauri-agent/src/App.tsx` — 挂载 `<ExtensionUiHost />`
- 修改 `tauri-agent/src/features/settings/settingsSchema.ts` — 加「安全」分类开关
- 修改 `tauri-agent/scripts/build-sidecar.mjs` 流程外：重建 sidecar 验证

---

## 任务 1：安全规则纯函数

**文件：**
- 创建：`extensions/safety/rules.ts`
- 测试：`extensions/safety/rules.test.ts`
- 创建：`extensions/safety/package.json`

- [ ] **步骤 1：写 package.json（含 vitest）**

```json
{
  "name": "@gren/ext-safety",
  "private": true,
  "type": "module",
  "scripts": { "test": "vitest run" },
  "devDependencies": { "vitest": "^4.1.8" }
}
```

- [ ] **步骤 2：写失败测试** `extensions/safety/rules.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { isDangerousBash, extractPath, matchProtectedPath } from "./rules.js";

describe("isDangerousBash", () => {
  it("flags rm -rf / sudo / chmod 777", () => {
    expect(isDangerousBash("rm -rf /tmp/x")).toBe(true);
    expect(isDangerousBash("sudo apt update")).toBe(true);
    expect(isDangerousBash("chmod 777 a")).toBe(true);
  });
  it("ignores safe commands", () => {
    expect(isDangerousBash("ls -la")).toBe(false);
    expect(isDangerousBash("git status")).toBe(false);
  });
});

describe("protected paths", () => {
  it("extractPath reads common field names", () => {
    expect(extractPath({ path: "a.txt" })).toBe("a.txt");
    expect(extractPath({ file_path: "b.txt" })).toBe("b.txt");
    expect(extractPath({ filePath: "c.txt" })).toBe("c.txt");
  });
  it("matches .env/.git/node_modules/keys", () => {
    expect(matchProtectedPath(".env")).toBe(true);
    expect(matchProtectedPath("repo/.git/config")).toBe(true);
    expect(matchProtectedPath("node_modules/x/y.js")).toBe(true);
    expect(matchProtectedPath("certs/server.pem")).toBe(true);
    expect(matchProtectedPath("src/app.ts")).toBe(false);
  });
});
```

- [ ] **步骤 3：运行确认失败** — `cd extensions/safety && npx vitest run` → FAIL（模块不存在）

- [ ] **步骤 4：实现** `extensions/safety/rules.ts`

```ts
const DANGEROUS_BASH = [
  /\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r|--recursive)/i,
  /\bsudo\b/i,
  /\b(chmod|chown)\b[^\n]*\b777\b/i,
  /\bmkfs\b/i,
  /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/, // fork bomb
  />\s*\/dev\/sd[a-z]/i,
];

export function isDangerousBash(command: string): boolean {
  return DANGEROUS_BASH.some((re) => re.test(command));
}

const PROTECTED = [
  /(^|[\\/])\.env(\.|$)/i,
  /(^|[\\/])\.git([\\/]|$)/i,
  /(^|[\\/])node_modules([\\/]|$)/i,
  /\.(pem|key)$/i,
];

export function matchProtectedPath(p: string): boolean {
  if (!p) return false;
  return PROTECTED.some((re) => re.test(p));
}

export function extractPath(input: Record<string, unknown>): string | undefined {
  const v = input?.path ?? input?.file_path ?? input?.filePath;
  return typeof v === "string" ? v : undefined;
}
```

- [ ] **步骤 5：运行确认通过** — `cd extensions/safety && npx vitest run` → PASS

- [ ] **步骤 6：Commit**

```bash
git add extensions/safety/rules.ts extensions/safety/rules.test.ts extensions/safety/package.json
git commit -m "feat(safety): add dangerous-bash and protected-path rule functions (A0)"
```

---

## 任务 2：safety extension 入口（tool_call 拦截 + 信任 + 会话确认）

**文件：**
- 创建：`extensions/safety/index.ts`
- 创建：`extensions/safety/sandbox.ts`

- [ ] **步骤 1：写 sandbox 接口** `extensions/safety/sandbox.ts`

```ts
export interface SandboxAdapter {
  isEnabled(): boolean;
  // 预留：future 接 @anthropic-ai/sandbox-runtime / gondolin
  exec?(command: string): Promise<{ stdout: string; stderr: string; code: number }>;
}

export class NoopSandbox implements SandboxAdapter {
  isEnabled() {
    return false;
  }
}
```

- [ ] **步骤 2：实现 extension** `extensions/safety/index.ts`

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { extractPath, isDangerousBash, matchProtectedPath } from "./rules.js";

const off = (v: string | undefined) => v === "0" || v?.toLowerCase() === "false";

export default function (pi: ExtensionAPI) {
  const guardBash = !off(process.env.SAFETY_BASH_CONFIRM);
  const guardPaths = !off(process.env.SAFETY_PROTECT_PATHS);

  pi.on("tool_call", async (event, ctx) => {
    if (guardBash && event.toolName === "bash") {
      const command = String(event.input?.command ?? "");
      if (isDangerousBash(command)) {
        if (!ctx.hasUI) return { block: true, reason: "Dangerous command blocked (no UI)" };
        const choice = await ctx.ui.select(`⚠️ 危险命令：\n\n  ${command}\n\n是否允许？`, ["允许", "拒绝"]);
        if (choice !== "允许") return { block: true, reason: "用户拒绝执行" };
      }
    }
    if (guardPaths && (event.toolName === "write" || event.toolName === "edit")) {
      const p = extractPath((event.input ?? {}) as Record<string, unknown>);
      if (p && matchProtectedPath(p)) {
        return { block: true, reason: `受保护路径，已阻止写入：${p}` };
      }
    }
    return undefined;
  });

  pi.on("project_trust", async (_event, ctx) => {
    if (!ctx.hasUI) return undefined;
    const ok = await ctx.ui.confirm("项目信任", "信任此工作区并允许写入/执行命令？");
    return ok ? undefined : { block: true, reason: "用户未信任此项目" };
  });
}
```

> 注：`project_trust` 返回值语义以官方 `project-trust.ts` 为准（实现时对照 `pi/packages/coding-agent/examples/extensions/project-trust.ts`，若该事件不支持 `block` 返回，则改为 `ctx` 标记信任态并在 `tool_call` 中据此拦截）。

- [ ] **步骤 3：Commit**

```bash
git add extensions/safety/index.ts extensions/safety/sandbox.ts
git commit -m "feat(safety): tool_call interception (bash/paths) + project trust + sandbox stub (A0)"
```

---

## 任务 3：注册并重建 sidecar

**文件：**
- 修改：`extensions/index.ts`

- [ ] **步骤 1：注册 safety**（加在 `allExtensions` 最前，使护栏最先拦截）

```ts
import safety from "./safety/index.js";
// ...在导出与数组中加入 safety：
export { safety, knowledgeRag, /* ...原有 */ };
export const allExtensions = [
  safety,
  knowledgeRag,
  longTermMemory,
  webFetch,
  imageGen,
  codeReview,
  multiAgent,
  tts,
  imGateway,
];
```

- [ ] **步骤 2：装依赖并重建 sidecar**（需先关闭 GrenAgent 窗口）

运行：`cd extensions && npm install && cd ../tauri-agent && node scripts/build-sidecar.mjs`
预期：`GrenAgent sidecar ready: ...pi-x86_64-pc-windows-msvc.exe`

- [ ] **步骤 3：Commit**

```bash
git add extensions/index.ts
git commit -m "feat(safety): register safety extension into sidecar bundle (A0)"
```

---

## 任务 4：前端渲染 extension confirm/select 弹窗

当前 `onPiUiRequest`（`tauri-agent/src/lib/pi.ts`）只定义未消费。补一个 Host 组件渲染 confirm/select 并回传。

**文件：**
- 创建：`tauri-agent/src/features/extensionUi/ExtensionUiHost.tsx`
- 测试：`tauri-agent/src/features/extensionUi/ExtensionUiHost.test.tsx`
- 修改：`tauri-agent/src/App.tsx`

- [ ] **步骤 1：写失败测试** `ExtensionUiHost.test.tsx`

```tsx
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const respond = vi.fn(() => Promise.resolve());
let emit: (e: any) => void = () => {};
vi.mock('../../lib/pi', () => ({
  onPiUiRequest: (h: (e: any) => void) => { emit = h; return Promise.resolve(() => {}); },
  extensionUiRespond: (...a: unknown[]) => respond(...a),
}));

import { ExtensionUiHost } from './ExtensionUiHost';

afterEach(cleanup);

describe('ExtensionUiHost', () => {
  it('renders a select request and responds with the chosen value', async () => {
    render(<ExtensionUiHost />);
    emit({ workspace: '/ws', request: { id: 'u1', method: 'select', title: '允许？', options: ['允许', '拒绝'] } });
    await waitFor(() => expect(screen.getByText('允许？')).toBeTruthy());
    fireEvent.click(screen.getByText('拒绝'));
    await waitFor(() => expect(respond).toHaveBeenCalledWith('/ws', { id: 'u1', value: '拒绝' }));
  });
});
```

- [ ] **步骤 2：运行确认失败** — `cd tauri-agent && npx vitest run src/features/extensionUi/ExtensionUiHost.test.tsx` → FAIL

- [ ] **步骤 3：实现** `ExtensionUiHost.tsx`

```tsx
import { Modal } from '@lobehub/ui';
import { useEffect, useState } from 'react';
import { onPiUiRequest, extensionUiRespond, type PiUiRequestEnvelope } from '../../lib/pi';

export function ExtensionUiHost() {
  const [item, setItem] = useState<PiUiRequestEnvelope | null>(null);

  useEffect(() => {
    let un: undefined | (() => void);
    void onPiUiRequest((e) => setItem(e)).then((fn) => { un = fn; });
    return () => un?.();
  }, []);

  if (!item) return null;
  const { workspace = '.', request } = item;
  const options: string[] = Array.isArray((request as { options?: string[] }).options)
    ? (request as { options?: string[] }).options!
    : ['确定', '取消'];

  const answer = (value: string) => {
    void extensionUiRespond(workspace, { id: request.id, value });
    setItem(null);
  };

  const isConfirm = request.method === 'confirm';
  return (
    <Modal open title={request.title ?? '确认'} footer={null} onCancel={() => answer(isConfirm ? 'false' : options[options.length - 1])}>
      <div style={{ whiteSpace: 'pre-wrap', marginBottom: 12 }}>{request.title}</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {(isConfirm ? ['确定', '取消'] : options).map((opt, i) => (
          <button
            key={opt}
            data-testid={`ext-ui-opt-${i}`}
            onClick={() => answer(isConfirm ? (opt === '确定' ? 'true' : 'false') : opt)}
          >
            {opt}
          </button>
        ))}
      </div>
    </Modal>
  );
}
```

> 注：`extensionUiRespond` 的 response 形状以 `pi.ts` 定义为准（实现时核对：`id` + 值字段名是否为 `value`/`choice`/`result`，对齐 `src-tauri` 的 `extension_ui_respond` 解析）。

- [ ] **步骤 4：挂载到 App** — `tauri-agent/src/App.tsx` 在 `<ThemeBridge />` 同级加 `<ExtensionUiHost />`

```tsx
      <ThemeBridge />
      <ExtensionUiHost />
```
（并在顶部 `import { ExtensionUiHost } from './features/extensionUi/ExtensionUiHost';`）

- [ ] **步骤 5：运行确认通过 + 类型检查**

运行：`cd tauri-agent && npx vitest run src/features/extensionUi/ExtensionUiHost.test.tsx && npx tsc --noEmit`
预期：测试 PASS，tsc 退出 0

- [ ] **步骤 6：Commit**

```bash
git add tauri-agent/src/features/extensionUi/ tauri-agent/src/App.tsx
git commit -m "feat(safety): render extension confirm/select dialogs in GrenAgent UI (A0)"
```

---

## 任务 5：设置面板安全开关

**文件：**
- 修改：`tauri-agent/src/features/settings/settingsSchema.ts`

- [ ] **步骤 1：加「安全」分类两项**（沿用现有 schema 形态：boolean 字段映射到 env）

```ts
// 在分类数组中追加：
{
  key: 'safety',
  title: '安全',
  fields: [
    { key: 'SAFETY_BASH_CONFIRM', label: '危险命令前确认', type: 'boolean' },
    { key: 'SAFETY_PROTECT_PATHS', label: '保护敏感路径（.env/.git/...）', type: 'boolean' },
  ],
},
```

> 实现前先读 `settingsSchema.ts` 当前结构，按其确切字段形态（category/field 的键名）对齐；env 默认未设=开启（与 `index.ts` 的 `off()` 语义一致）。

- [ ] **步骤 2：类型检查 + commit**

运行：`cd tauri-agent && npx tsc --noEmit`（预期 0）

```bash
git add tauri-agent/src/features/settings/settingsSchema.ts
git commit -m "feat(safety): settings toggles for safety guards (A0)"
```

---

## 自检

**规格覆盖度（对照 spec §4.3）：**
- 危险 bash 确认 → 任务 1+2 ✅
- 写保护路径 → 任务 1+2 ✅
- 项目信任 → 任务 2 ✅（含官方对照注记）
- 危险会话操作确认 → ⚠️ 本计划未含独立任务；实现时若 `confirm-destructive.ts` 模式适用，追加为任务 2b（参考 `pi/.../examples/extensions/confirm-destructive.ts`，对 session clear/fork/switch 事件确认）
- sandbox adapter 接口 → 任务 2（NoopSandbox）✅
- 确认 UI（React 弹窗）→ 任务 4 ✅
- 设置开关 → 任务 5 ✅

**占位符扫描：** 三处「注/实现前先读」均指向具体官方文件用于核对真实 API 字段名，非功能占位；代码块均可直接落地。

**类型一致性：** `isDangerousBash`/`matchProtectedPath`/`extractPath` 在 rules.ts 定义、index.ts 与测试一致；`extensionUiRespond(workspace, {id, value})` 与测试一致。

**待实现时确认的真实 API（开工第一步读取）：**
1. `tool_call` 对 write/edit 的 `event.input` 字段名（已用 path/file_path/filePath 兼容）
2. `project_trust` 事件返回值语义（对照官方 `project-trust.ts`）
3. `extension_ui_respond` 的 response 字段（对照 `pi.ts` + `src-tauri/src/pi/types.rs`）

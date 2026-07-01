// 把 GrenAgent agent sidecar(pi runtime + 8 个内置 extension)编译为独立二进制，
// 按 Tauri target triple 命名放入 src-tauri/binaries/pi-<triple>。
// Rust 侧(pi/sidecar.rs)无需改动：它 spawn "pi" 走 RPC，协议与官方 pi 一致，
// 只是这个二进制现在自带了我们的 8 个 extension（extensionFactories 编译进去）。
//
// 用法：node scripts/build-sidecar.mjs （或 npm run build:sidecar）
// 前置：已安装 bun；sidecar 源在 ../cli（其 package.json 依赖 @earendil-works/pi-coding-agent）。
import { execSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const appRoot = resolve(import.meta.dirname, '..'); // tauri-agent/
const sidecarRoot = resolve(appRoot, '..', 'cli'); // GrenAgent agent sidecar（pi + 8 extension）
const binDir = join(appRoot, 'src-tauri', 'binaries');
mkdirSync(binDir, { recursive: true });

// 1) 安装 sidecar 依赖（@earendil-works/pi-coding-agent + typebox），bun 编译需要解析它们。
console.log('Installing sidecar deps…');
execSync('npm install', { cwd: sidecarRoot, stdio: 'inherit' });
console.log('Patching pi shell resolution for Windows…');
execSync('node scripts/patch-pi-shell.mjs', { cwd: sidecarRoot, stdio: 'inherit' });

// extensions/*/index.ts 也 import 'typebox' 等；bun 从 ../extensions/*/ 解析这些 import，
// 需在 extensions/ 也装好依赖，否则 bun build 报 "Could not resolve typebox"。
const extensionsRoot = resolve(appRoot, '..', 'extensions');
console.log('Installing extensions deps…');
execSync('npm install', { cwd: extensionsRoot, stdio: 'inherit' });

// 2) 取 sidecar 目标 triple：CI 交叉编译时由 PI_SIDECAR_TARGET 指定（须与 Tauri --target 一致），
//    否则用 rustc host triple（本地 dev / 原生 runner）。
function sidecarTriple() {
  const explicit = process.env.PI_SIDECAR_TARGET?.trim();
  if (explicit) return explicit;
  const hostLine = execSync('rustc -Vv')
    .toString()
    .split('\n')
    .find((l) => l.startsWith('host:'));
  if (!hostLine) throw new Error('could not determine rustc host triple');
  return hostLine.split('host:')[1].trim();
}
const triple = sidecarTriple();
const isWin = triple.includes('windows');
const dest = join(binDir, `pi-${triple}${isWin ? '.exe' : ''}`);

// 3) bun 编译 sidecar 为单文件二进制（内置 pi + 8 extension）。
console.log('Compiling GrenAgent sidecar via bun…');
execSync(`bun build ./src/main.ts --compile --outfile "${dest}"`, { cwd: sidecarRoot, stdio: 'inherit' });

// 4) 复制 pi 运行时资源（theme/assets 等）。从已安装的完整 npm 包 dist 取（本地 ../pi/dist 可能残缺）。
//    通过 sidecar.rs 设置的 PI_PACKAGE_DIR=binaries/ 让运行时按需找到这些资源。
const piPkgDist = resolve(sidecarRoot, 'node_modules', '@earendil-works', 'pi-coding-agent', 'dist');
if (existsSync(piPkgDist)) {
  for (const dir of ['theme', 'assets', 'export-html', 'docs', 'examples']) {
    const from = join(piPkgDist, dir);
    if (existsSync(from)) cpSync(from, join(binDir, dir), { recursive: true });
  }

  // 兼容新版 pi 把内置主题挪到了 dist/modes/interactive/theme/
  // 运行时仍按 <PI_PACKAGE_DIR>/theme/dark.json 读取，所以额外复制一份到 binaries/theme
  const interactiveTheme = join(piPkgDist, 'modes', 'interactive', 'theme');
  if (existsSync(interactiveTheme)) {
    cpSync(interactiveTheme, join(binDir, 'theme'), { recursive: true });
    console.log('Copied built-in themes from modes/interactive/theme.');
  }

  // package.json / README / CHANGELOG 在包根（不在 dist/）；旧逻辑从 dist/ 复制会静默跳过，
  // 导致 binaries/package.json 长期陈旧、运行时 VERSION 读出错误版本。改为优先包根、回退 dist。
  const piPkgRoot = resolve(piPkgDist, '..');
  for (const file of ['package.json', 'README.md', 'CHANGELOG.md', 'photon_rs_bg.wasm']) {
    const fromRoot = join(piPkgRoot, file);
    const fromDist = join(piPkgDist, file);
    const from = existsSync(fromRoot) ? fromRoot : fromDist;
    if (existsSync(from)) copyFileSync(from, join(binDir, file));
  }
} else {
  console.warn('warn: pi npm dist not found under cli/node_modules; theme/assets not copied.');
}

console.log(`GrenAgent sidecar ready: ${dest}`);

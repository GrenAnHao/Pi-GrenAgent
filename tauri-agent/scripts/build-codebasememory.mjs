// Build script: vendors the self-contained codebase-memory-mcp binary for the
// current platform into src-tauri/binaries/codebase-memory/ so Tauri can ship it
// as a bundled resource (see tauri.conf.json `bundle.resources`).
// Run via `npm run build:codebasememory`.
//
// codebase-memory-mcp ships as a SINGLE static binary per platform, distributed
// as a GitHub Releases archive: codebase-memory-mcp-<os>-<arch>.{tar.gz,zip}.
// We fetch it directly and verify against the release's checksums.txt.
//
// Layout after extraction (archives are flat — no top-level dir, no strip):
//   unix : codebase-memory-mcp        (+ install.sh / LICENSE / notices)
//   win32: codebase-memory-mcp.exe    (+ install.ps1 / LICENSE / notices)
//
// Knobs:
//   CODEBASEMEMORY_VERSION=x.y.z       override the pinned version
//   CODEBASEMEMORY_DOWNLOAD_BASE=URL   release-download base (mirrors / air-gapped)
//   CODEBASEMEMORY_FORCE=1             re-download even if a binary is already present
import { execSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, createWriteStream, readFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import https from "node:https";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = process.env.CODEBASEMEMORY_VERSION || "0.8.1"; // pinned; bump to upgrade
const REPO = "DeusData/codebase-memory-mcp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");
const destDir = join(appRoot, "src-tauri", "binaries", "codebase-memory");

const isWin = process.platform === "win32";
// Release asset naming: <os> = windows|darwin|linux, <arch> = amd64|arm64.
const osTag = isWin ? "windows" : process.platform === "darwin" ? "darwin" : "linux";
const archTag = process.arch === "arm64" ? "arm64" : "amd64";
const exeName = isWin ? "codebase-memory-mcp.exe" : "codebase-memory-mcp";
const asset = `codebase-memory-mcp-${osTag}-${archTag}${isWin ? ".zip" : ".tar.gz"}`;
const base = process.env.CODEBASEMEMORY_DOWNLOAD_BASE || `https://github.com/${REPO}/releases/download`;
const url = `${base}/v${VERSION}/${asset}`;

function binaryExists(dir) {
  return existsSync(join(dir, exeName));
}

async function main() {
  if (!process.env.CODEBASEMEMORY_FORCE && binaryExists(destDir)) {
    console.log(`[build-codebasememory] binary already present for ${osTag}-${archTag}: ${destDir}`);
    return;
  }

  console.log(`[build-codebasememory] fetching ${asset} (codebase-memory-mcp v${VERSION})…`);
  mkdirSync(dirname(destDir), { recursive: true });
  const stage = mkdtempSync(join(tmpdir(), "cbm-dl-"));
  try {
    const archivePath = join(stage, asset);
    await download(url, archivePath, 6);
    await verifyChecksum(archivePath, asset, stage);

    // Archives are flat (binary at top level) — extract straight into destDir.
    rmSync(destDir, { recursive: true, force: true });
    mkdirSync(destDir, { recursive: true });
    extract(archivePath, destDir);

    if (!binaryExists(destDir)) {
      throw new Error(`extracted archive is missing ${exeName} under ${destDir}`);
    }
    if (!isWin) chmodSync(join(destDir, exeName), 0o755);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }

  console.log(`[build-codebasememory] binary ready: ${join(destDir, exeName)}`);
  smoke();
}

// GET with manual redirect following (GitHub release URLs redirect to a CDN).
function download(fileUrl, dest, redirectsLeft) {
  return new Promise((resolvePromise, reject) => {
    const req = https.get(fileUrl, { headers: { "User-Agent": "pi-build-codebasememory" }, timeout: 30000 }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) return reject(new Error("too many redirects"));
        return download(new URL(res.headers.location, fileUrl).toString(), dest, redirectsLeft - 1).then(resolvePromise, reject);
      }
      if (status !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${status} for ${fileUrl}`));
      }
      const file = createWriteStream(dest);
      res.on("error", reject);
      res.pipe(file);
      file.on("error", reject);
      file.on("finish", () => file.close(() => resolvePromise()));
    });
    req.on("timeout", () => req.destroy(new Error("connection timed out")));
    req.on("error", reject);
  });
}

// Integrity check against the release's checksums.txt. The archive MUST match if
// listed; if the file is absent/unreachable, proceed (it still came over GitHub TLS).
async function verifyChecksum(archivePath, assetName, stage) {
  const sumsPath = join(stage, "checksums.txt");
  try {
    await download(`${base}/v${VERSION}/checksums.txt`, sumsPath, 6);
  } catch {
    return; // not published / unreachable → skip
  }
  let expected = null;
  for (const line of readFileSync(sumsPath, "utf8").split("\n")) {
    const m = line.trim().match(/^([0-9a-fA-F]{64})\s+\*?(.+)$/);
    if (m && m[2].trim().replace(/^.*[\\/]/, "") === assetName) {
      expected = m[1].toLowerCase();
      break;
    }
  }
  if (!expected) return; // asset not listed → nothing to check
  const actual = createHash("sha256").update(readFileSync(archivePath)).digest("hex");
  if (actual !== expected) {
    throw new Error(`checksum mismatch for ${assetName} (expected ${expected.slice(0, 12)}…, got ${actual.slice(0, 12)}…)`);
  }
  console.log("[build-codebasememory] checksum verified.");
}

// Extract via the system tar — present on macOS, Linux, and Windows 10+
// (bsdtar reads .zip too). Archives are flat, so no --strip-components.
function extract(archive, dir) {
  const args = isWin ? ["-xf", archive, "-C", dir] : ["-xzf", archive, "-C", dir];
  execSync(`tar ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`, { stdio: "inherit" });
}

// Best-effort smoke: print the bundled binary's version. Never fails the build.
function smoke() {
  try {
    const out = execSync(`"${join(destDir, exeName)}" --version`, { encoding: "utf8" }).trim();
    console.log(`[build-codebasememory] smoke ok: ${out}`);
  } catch (e) {
    console.warn(`[build-codebasememory] smoke skipped: ${e.message}`);
  }
}

main().catch((e) => {
  console.error(`[build-codebasememory] ${e && e.message ? e.message : e}`);
  process.exit(1);
});

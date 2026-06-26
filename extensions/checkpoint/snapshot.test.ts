import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diff, ensureRepo, gitArgs, parseNameStatus, restore, track } from "./snapshot.js";

describe("gitArgs", () => {
  it("prepends windows-safe flags + git-dir + work-tree", () => {
    const a = gitArgs("/gd", "/wt", ["status"]);
    expect(a[a.indexOf("--git-dir") + 1]).toBe("/gd");
    expect(a[a.indexOf("--work-tree") + 1]).toBe("/wt");
    expect(a).toContain("core.autocrlf=false");
    expect(a.at(-1)).toBe("status");
  });
});

describe("parseNameStatus", () => {
  it("parses name-status lines", () => {
    expect(parseNameStatus("A\tfoo.txt\nM\tbar/baz.ts\n")).toEqual([
      { file: "foo.txt", status: "A" },
      { file: "bar/baz.ts", status: "M" },
    ]);
  });
  it("ignores blanks", () => {
    expect(parseNameStatus("\n\n")).toEqual([]);
  });
});

const dirs: string[] = [];
function ws(): { cwd: string; gitdir: string } {
  const cwd = mkdtempSync(join(tmpdir(), "cp-ws-"));
  dirs.push(cwd);
  return { cwd, gitdir: join(cwd, ".pi", "snapshots", "git") };
}
afterEach(() => {
  // Windows: git subprocesses can briefly hold handles to the temp work-tree, so a
  // plain rm races with EPERM/EBUSY. Retry, and treat residual cleanup as
  // best-effort (the OS reclaims tmpdir eventually) rather than failing the test.
  for (const d of dirs.splice(0)) {
    try {
      rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // ignore: temp-dir cleanup is best-effort on Windows
    }
  }
});

describe("track / diff / restore round-trip", () => {
  it("tracks changes, diffs, and restores file contents", async () => {
    const { cwd, gitdir } = ws();
    writeFileSync(join(cwd, "a.txt"), "v1");
    await ensureRepo(gitdir, cwd);
    const s1 = await track(gitdir, cwd);
    expect(s1?.hash).toMatch(/^[0-9a-f]{7,40}$/);

    writeFileSync(join(cwd, "a.txt"), "v2-modified");
    writeFileSync(join(cwd, "b.txt"), "added");
    const s2 = await track(gitdir, cwd);
    expect(s2).not.toBeNull();
    const d = await diff(gitdir, cwd, s1!.hash);
    expect(d).toContain("v2-modified");

    await restore(gitdir, cwd, s1!.hash);
    expect(readFileSync(join(cwd, "a.txt"), "utf8")).toBe("v1");
    expect(existsSync(join(cwd, "b.txt"))).toBe(false);
  }, 30000);

  it("returns null when nothing changed", async () => {
    const { cwd, gitdir } = ws();
    writeFileSync(join(cwd, "a.txt"), "x");
    await ensureRepo(gitdir, cwd);
    expect(await track(gitdir, cwd)).not.toBeNull();
    expect(await track(gitdir, cwd)).toBeNull();
  }, 30000);

  it("respects .gitignore and skips the .pi dir", async () => {
    const { cwd, gitdir } = ws();
    writeFileSync(join(cwd, ".gitignore"), "ignored.txt\n");
    writeFileSync(join(cwd, "ignored.txt"), "secret");
    writeFileSync(join(cwd, "kept.txt"), "ok");
    await ensureRepo(gitdir, cwd);
    const s = await track(gitdir, cwd);
    const files = (s?.files ?? []).map((f) => f.file);
    expect(files).toContain("kept.txt");
    expect(files).not.toContain("ignored.txt");
  }, 30000);
});

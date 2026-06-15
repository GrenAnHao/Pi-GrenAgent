import { describe, expect, it } from "vitest";
import { isDangerousBash, extractPath, isMutatingBash, matchProtectedPath, matchWriteAllowed, normalizePath } from "./rules.js";

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

describe("normalizePath", () => {
  it("converts backslashes and strips ./", () => {
    expect(normalizePath(".\\plans\\a.md")).toBe("plans/a.md");
  });
});

describe("matchWriteAllowed", () => {
  it("allows paths under an allowlisted prefix", () => {
    expect(matchWriteAllowed("plans/001.md", ["plans/"])).toBe(true);
    expect(matchWriteAllowed("plans", ["plans/"])).toBe(true);
  });
  it("rejects paths outside the allowlist", () => {
    expect(matchWriteAllowed("src/index.ts", ["plans/"])).toBe(false);
  });
  it("rejects path traversal", () => {
    expect(matchWriteAllowed("plans/../src/x.ts", ["plans/"])).toBe(false);
  });
  it("empty allowlist allows nothing", () => {
    expect(matchWriteAllowed("plans/001.md", [])).toBe(false);
  });
});

describe("isMutatingBash", () => {
  it("flags redirects, rm/mv, sed -i, git mutators, pkg installs", () => {
    expect(isMutatingBash("echo hi > out.txt")).toBe(true);
    expect(isMutatingBash("rm foo")).toBe(true);
    expect(isMutatingBash("sed -i 's/a/b/' f")).toBe(true);
    expect(isMutatingBash("git commit -m x")).toBe(true);
    expect(isMutatingBash("npm install left-pad")).toBe(true);
  });
  it("allows read-only commands", () => {
    expect(isMutatingBash("ls -la")).toBe(false);
    expect(isMutatingBash("git status")).toBe(false);
    expect(isMutatingBash("grep foo src")).toBe(false);
  });
});

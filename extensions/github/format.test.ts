import { describe, expect, it } from "vitest";
import { formatResult } from "./format.js";

describe("formatResult", () => {
  it("formats pr_view json", () => {
    const raw = JSON.stringify({
      number: 7,
      title: "Fix bug",
      state: "OPEN",
      isDraft: false,
      author: { login: "alice" },
      headRefName: "fix",
      baseRefName: "main",
      url: "u",
      body: "details",
      labels: [{ name: "bug" }],
    });
    const out = formatResult("pr_view", raw);
    expect(out).toContain("#7 Fix bug");
    expect(out).toContain("alice");
    expect(out).toContain("fix → main");
    expect(out).toContain("bug");
    expect(out).toContain("details");
  });
  it("formats repo_view json", () => {
    const raw = JSON.stringify({
      nameWithOwner: "o/r",
      description: "desc",
      stargazerCount: 9,
      forkCount: 2,
      primaryLanguage: { name: "TypeScript" },
      url: "u",
    });
    const out = formatResult("repo_view", raw);
    expect(out).toContain("o/r");
    expect(out).toContain("star 9");
    expect(out).toContain("TypeScript");
  });
  it("formats pr_list and empty", () => {
    const raw = JSON.stringify([{ number: 1, title: "A", state: "OPEN", author: { login: "x" } }]);
    expect(formatResult("pr_list", raw)).toContain("#1 [OPEN] A");
    expect(formatResult("pr_list", "[]")).toContain("无 PR");
  });
  it("returns raw for pr_diff and code_search", () => {
    expect(formatResult("pr_diff", "diff --git a b")).toBe("diff --git a b");
    expect(formatResult("code_search", "")).toBe("(空)");
  });
  it("falls back to raw on invalid json", () => {
    expect(formatResult("pr_view", "not json")).toBe("not json");
  });
});

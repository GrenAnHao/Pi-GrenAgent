import { describe, expect, it } from "vitest";
import { buildGhArgs } from "./args.js";

describe("buildGhArgs", () => {
  it("pr_view with repo and number", () => {
    expect(buildGhArgs("pr_view", { number: 12, repo: "o/r" })).toEqual([
      "pr",
      "view",
      "12",
      "--repo",
      "o/r",
      "--json",
      expect.any(String),
    ]);
  });
  it("pr_diff returns raw diff args", () => {
    expect(buildGhArgs("pr_diff", { number: 5 })).toEqual(["pr", "diff", "5"]);
  });
  it("repo_view without repo omits positional", () => {
    const a = buildGhArgs("repo_view", {});
    expect(a.slice(0, 2)).toEqual(["repo", "view"]);
    expect(a).toContain("--json");
  });
  it("pr_list applies state and limit defaults", () => {
    expect(buildGhArgs("pr_list", {})).toEqual([
      "pr",
      "list",
      "--state",
      "open",
      "--limit",
      "30",
      "--json",
      expect.any(String),
    ]);
    expect(buildGhArgs("pr_list", { state: "merged", limit: 5 })).toContain("merged");
  });
  it("code_search needs query", () => {
    expect(buildGhArgs("code_search", { query: "foo" })).toEqual(["search", "code", "foo", "--limit", "30"]);
    expect(() => buildGhArgs("code_search", {})).toThrow();
  });
  it("view actions need number", () => {
    expect(() => buildGhArgs("pr_view", {})).toThrow();
    expect(() => buildGhArgs("issue_view", {})).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { buildExploreProfile, extractFinalAnswer, EXPLORE_SYSTEM_PROMPT, slugFromPath } from "./explorer.js";

describe("buildExploreProfile", () => {
  it("uses the engine MCP when codebase-memory is active and the workspace is indexed", () => {
    const p = buildExploreProfile("codebase-memory", true);
    expect(p.fs).toBe("readonly");
    expect(p.net).toBe(false);
    expect(p.mcp).toEqual(["codebase-memory"]);
    expect(p.tools?.deny).toContain("bash");
    expect(p.model).toBe("cheap");
  });

  it("degrades to no MCP when not indexed (grep/glob/read baseline)", () => {
    expect(buildExploreProfile("codebase-memory", false).mcp).toBe(false);
  });

  it("degrades to no MCP when engine is off", () => {
    expect(buildExploreProfile("off", true).mcp).toBe(false);
  });

  it("degrades to no MCP for an unknown engine", () => {
    expect(buildExploreProfile("nope", true).mcp).toBe(false);
  });
});

describe("slugFromPath", () => {
  it("reproduces cbm_project_name_from_path (matches the indexed project name)", () => {
    // Verified against the real binary's list_projects output.
    expect(slugFromPath("D:/OneDrive/Project Files/Pi/extensions/multi-agent")).toBe(
      "D-OneDrive-Project-Files-Pi-extensions-multi-agent",
    );
  });

  it("normalizes backslashes, drive colons, spaces and collapses dashes", () => {
    expect(slugFromPath("C:\\Users\\me\\my project")).toBe("C-Users-me-my-project");
  });

  it("trims leading/trailing separators and falls back to 'root'", () => {
    expect(slugFromPath("/")).toBe("root");
    expect(slugFromPath("/home/u/repo")).toBe("home-u-repo");
  });
});

describe("extractFinalAnswer", () => {
  it("extracts the <final_answer> block", () => {
    const out = "thinking...\n<final_answer>\nsrc/a.ts:10-20 - does X\n</final_answer>\ntrailing";
    expect(extractFinalAnswer(out)).toBe("src/a.ts:10-20 - does X");
  });

  it("falls back to the full output when no block is present", () => {
    expect(extractFinalAnswer("just some text")).toBe("just some text");
  });

  it("is case-insensitive and trims", () => {
    expect(extractFinalAnswer("<FINAL_ANSWER>  hi  </FINAL_ANSWER>")).toBe("hi");
  });
});

describe("EXPLORE_SYSTEM_PROMPT", () => {
  it("instructs read-only exploration and the final_answer contract", () => {
    expect(EXPLORE_SYSTEM_PROMPT).toMatch(/final_answer/);
    expect(EXPLORE_SYSTEM_PROMPT.toLowerCase()).toMatch(/read-only|只读/);
  });
});

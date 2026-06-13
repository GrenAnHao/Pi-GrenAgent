import { describe, expect, it } from "vitest";
import { extractDoneSteps, extractTodoItems, isSafeCommand, markCompletedSteps } from "./utils.js";

describe("isSafeCommand", () => {
  it("allows read-only commands", () => {
    expect(isSafeCommand("cat file.ts")).toBe(true);
    expect(isSafeCommand("git status")).toBe(true);
    expect(isSafeCommand("ls -la")).toBe(true);
  });
  it("blocks destructive commands", () => {
    expect(isSafeCommand("rm -rf x")).toBe(false);
    expect(isSafeCommand("git commit -m x")).toBe(false);
    expect(isSafeCommand("npm install")).toBe(false);
    expect(isSafeCommand("echo hi > f")).toBe(false);
  });
  it("blocks commands not on the safe allowlist", () => {
    expect(isSafeCommand("some-random-binary")).toBe(false);
  });
});

describe("extractTodoItems", () => {
  it("parses numbered steps under a Plan: header", () => {
    const md = "Here is my plan.\n\nPlan:\n1. Read the config loader\n2. Add a validation step\n3. Write the tests\n";
    const items = extractTodoItems(md);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ step: 1, completed: false });
    expect(items[1].text.toLowerCase()).toContain("validation");
  });
  it("returns empty when there is no Plan: header", () => {
    expect(extractTodoItems("no plan here\n1. nope")).toEqual([]);
  });
});

describe("markCompletedSteps", () => {
  it("marks steps referenced by [DONE:n]", () => {
    const items = extractTodoItems("Plan:\n1. First step here\n2. Second step here\n");
    const n = markCompletedSteps("Did it. [DONE:1]", items);
    expect(n).toBe(1);
    expect(items[0].completed).toBe(true);
    expect(items[1].completed).toBe(false);
  });
  it("extractDoneSteps reads multiple markers", () => {
    expect(extractDoneSteps("[DONE:1] ... [DONE:3]")).toEqual([1, 3]);
  });
});

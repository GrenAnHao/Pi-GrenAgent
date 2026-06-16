import { describe, expect, it } from "vitest";
import { type AskFn } from "./llm.js";
import { extractState } from "./writer.js";

describe("extractState", () => {
  it("returns extracted markdown on success", async () => {
    const ask: AskFn = async () => "## Intent\n- build X";
    expect(await extractState(ask, "convo")).toBe("## Intent\n- build X");
  });
  it("keeps prev on empty output", async () => {
    const ask: AskFn = async () => "   ";
    expect(await extractState(ask, "convo", "## Intent\n- old")).toBe("## Intent\n- old");
  });
  it("keeps prev on throw", async () => {
    const ask: AskFn = async () => {
      throw new Error("no model");
    };
    expect(await extractState(ask, "convo", "## Intent\n- old")).toBe("## Intent\n- old");
  });
});

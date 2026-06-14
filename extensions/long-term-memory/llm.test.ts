import { describe, expect, it } from "vitest";
import { parseJsonLoose, resolveMemoryModel } from "./llm.js";

describe("parseJsonLoose", () => {
  it("parses plain JSON", () => {
    expect(parseJsonLoose('{"op":"ADD"}')).toEqual({ op: "ADD" });
  });
  it("parses JSON inside ```json fences with surrounding noise", () => {
    const raw = 'Sure:\n```json\n{"op":"NOOP","reason":"dup"}\n```\ndone';
    expect(parseJsonLoose(raw)).toEqual({ op: "NOOP", reason: "dup" });
  });
  it("returns undefined for non-JSON", () => {
    expect(parseJsonLoose("no json here")).toBeUndefined();
  });
});

describe("resolveMemoryModel", () => {
  const ctxModel = { provider: "deepseek", id: "deepseek-chat" } as never;
  it("returns ctx.model when MEMORY_MODEL unset", () => {
    const reg = { find: () => undefined } as never;
    expect(resolveMemoryModel(ctxModel, reg, undefined)).toBe(ctxModel);
  });
  it("resolves MEMORY_MODEL 'provider/id' via registry", () => {
    const found = { provider: "openai", id: "gpt-4o-mini" } as never;
    const reg = { find: (p: string, m: string) => (p === "openai" && m === "gpt-4o-mini" ? found : undefined) } as never;
    expect(resolveMemoryModel(ctxModel, reg, "openai/gpt-4o-mini")).toBe(found);
  });
  it("falls back to ctx.model when registry miss", () => {
    const reg = { find: () => undefined } as never;
    expect(resolveMemoryModel(ctxModel, reg, "openai/nope")).toBe(ctxModel);
  });
});

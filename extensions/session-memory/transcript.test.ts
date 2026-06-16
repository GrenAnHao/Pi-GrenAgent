import { describe, expect, it } from "vitest";
import { flattenMessages } from "./transcript.js";

describe("flattenMessages", () => {
  it("joins string and block content; keeps tail", () => {
    expect(
      flattenMessages([
        { role: "user", content: "hi" },
        { role: "assistant", content: [{ type: "text", text: "yo" }] },
      ]),
    ).toBe("user: hi\nassistant: yo");
  });
  it("slices to the most recent maxChars", () => {
    expect(flattenMessages([{ role: "user", content: "abcdef" }], 3)).toBe("def");
  });
});

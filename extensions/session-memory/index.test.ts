import { describe, expect, it } from "vitest";
import factory from "./index.js";

describe("session-memory factory", () => {
  it("registers state hooks and /session-state command", () => {
    const commands: string[] = [];
    const events: string[] = [];
    factory({
      registerCommand: (n: string) => commands.push(n),
      on: (e: string) => events.push(e),
    } as never);
    expect(commands).toContain("session-state");
    expect(events).toEqual(
      expect.arrayContaining(["turn_end", "agent_end", "session_before_compact", "session_compact", "before_agent_start"]),
    );
  });
});

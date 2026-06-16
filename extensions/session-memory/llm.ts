// In-process LLM access for session-state extraction. Uses the current agent
// model (ctx.model) via pi-ai's completeSimple — no sub-process, no extra key.
import type { Context, Model } from "@earendil-works/pi-ai";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";

export type AskFn = (systemPrompt: string, userPrompt: string) => Promise<string>;

/** Resolve the extraction model: SESSION_STATE_MODEL ("provider/id") or ctx.model. */
export function resolveModel(
  current: Model<never> | undefined,
  registry: Pick<ModelRegistry, "find">,
  override: string | undefined,
): Model<never> | undefined {
  const spec = override?.trim();
  if (spec && spec.includes("/")) {
    const slash = spec.indexOf("/");
    const found = registry.find(spec.slice(0, slash), spec.slice(slash + 1));
    if (found) return found as Model<never>;
  }
  return current;
}

export async function askLlm(
  model: Model<never>,
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const { completeSimple } = await import("@earendil-works/pi-ai");
  const context: Context = { systemPrompt, messages: [{ role: "user", content: userPrompt, timestamp: Date.now() }] };
  const msg = await completeSimple(model, context, { reasoning: "off", signal } as never);
  return msg.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("");
}

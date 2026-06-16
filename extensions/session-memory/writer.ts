import type { AskFn } from "./llm.js";

const SYSTEM =
  "You maintain a concise working-state summary of a coding session. Given the conversation, output " +
  "GitHub-flavored markdown with EXACTLY these sections (short bullet points): " +
  "'## Intent', '## Next step', '## Task progress', '## Key files', '## Key decisions'. " +
  "If a section has nothing, write '- (none)'. Output only the markdown, no prose around it.";

/** Extract structured state markdown. On empty/failed output, keep `prev` (graceful). */
export async function extractState(ask: AskFn, transcript: string, prev?: string): Promise<string | undefined> {
  try {
    const user = prev
      ? `Previous state:\n${prev}\n\nConversation (most recent last):\n${transcript}`
      : `Conversation (most recent last):\n${transcript}`;
    const out = (await ask(SYSTEM, user)).trim();
    return out.length > 0 ? out : prev;
  } catch {
    return prev;
  }
}

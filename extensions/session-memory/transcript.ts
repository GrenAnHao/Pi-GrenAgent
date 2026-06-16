function messageToText(m: unknown): string {
  const obj = (m ?? {}) as { role?: string; content?: unknown };
  const role = obj.role ?? "";
  const content = obj.content;
  let text = "";
  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content)) {
    text = content
      .filter((p): p is { type: string; text: string } => !!p && typeof p === "object" && (p as { type?: string }).type === "text")
      .map((p) => p.text)
      .join(" ");
  }
  return text ? `${role}: ${text}` : "";
}

export function flattenMessages(messages: unknown[], maxChars = 12000): string {
  return messages.map(messageToText).filter(Boolean).join("\n").slice(-maxChars);
}

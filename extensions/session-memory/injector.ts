export interface InjectionMessage {
  customType: string;
  content: string;
  display: boolean;
}

export function buildInjection(md: string, maxChars: number): InjectionMessage {
  const body = md.length > maxChars ? md.slice(0, maxChars) : md;
  return {
    customType: "session-state",
    content: `# Session working state (restored after compaction)\n\n${body}`,
    display: false,
  };
}

import { create } from 'zustand';

export type AgentMode = 'agent' | 'ask' | 'debug' | 'plan';

export const AGENT_MODES: AgentMode[] = ['agent', 'ask', 'debug', 'plan'];

/** 模式显示名（选择器选项用）。 */
export const MODE_LABELS: Record<AgentMode, string> = {
  agent: 'Agent',
  ask: 'Ask',
  debug: 'Debug',
  plan: 'Plan',
};

export function isAgentMode(v: unknown): v is AgentMode {
  return v === 'agent' || v === 'ask' || v === 'debug' || v === 'plan';
}

interface ModeState {
  /** 各 workspace 的当前模式（由 sidecar agent-mode 扩展经 setStatus 推送回读）。 */
  byWorkspace: Record<string, AgentMode>;
  setMode: (workspace: string, mode: AgentMode) => void;
}

export const useModeStore = create<ModeState>((set) => ({
  byWorkspace: {},
  setMode: (workspace, mode) =>
    set((s) =>
      s.byWorkspace[workspace] === mode
        ? s
        : { byWorkspace: { ...s.byWorkspace, [workspace]: mode } },
    ),
}));

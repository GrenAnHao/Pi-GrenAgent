export type ThinkingLevel = 'low' | 'medium' | 'high';

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; imageUrl: string };

export interface ImageContent {
  type: 'image';
  data: string;
}

export type RpcCommand =
  | { id?: string; type: 'prompt'; message: string; images?: ImageContent[] }
  | { id?: string; type: 'abort' }
  | { id?: string; type: 'get_messages' }
  | { id?: string; type: 'get_state' }
  | { id?: string; type: 'switch_session'; sessionPath: string }
  | { id?: string; type: 'new_session'; parentSession?: string }
  | { id?: string; type: 'set_model'; provider: string; modelId: string };

export interface RpcResponse<T = unknown> {
  id?: string;
  type: 'response';
  command: string;
  success: boolean;
  data?: T;
  error?: string;
}

export interface AssistantMessageEvent {
  type: 'text_delta' | 'thinking_delta' | 'tool_call';
  delta?: string;
  toolCallId?: string;
  toolName?: string;
  params?: unknown;
}

export type AgentEvent =
  | { type: 'agent_start'; timestamp: number }
  | { type: 'agent_end'; timestamp: number }
  | { type: 'message_start'; role: string; timestamp: number }
  | { type: 'message_update'; assistantMessageEvent: AssistantMessageEvent }
  | { type: 'message_end'; timestamp: number }
  | { type: 'tool_execution_start'; toolCallId: string; toolName: string; params: unknown }
  | { type: 'tool_execution_update'; toolCallId: string; content: string }
  | { type: 'tool_execution_end'; toolCallId: string; result: unknown }
  | { type: 'turn_start'; timestamp: number }
  | { type: 'turn_end'; timestamp: number };

export interface AgentMessage {
  role: 'user' | 'assistant' | 'toolResult';
  content: string | ContentPart[];
  timestamp: number;
  thinking?: string;
}

export interface ToolExecution {
  toolCallId: string;
  toolName: string;
  params: unknown;
  status: 'running' | 'success' | 'error';
  result?: unknown;
  startTime: number;
  endTime?: number;
}

export interface SessionInfo {
  path: string;
  name?: string;
  lastModified: number;
}

export interface AgentState {
  model?: { provider: string; id: string };
  thinkingLevel?: ThinkingLevel;
  sessionFile?: string;
}

export interface RpcConfig {
  provider?: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
}

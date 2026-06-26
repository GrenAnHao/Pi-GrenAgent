// LLM helpers for session-state extraction. Implementation is shared in _shared/llm;
// SESSION_STATE_MODEL ("provider/id") overrides ctx.model (resolution lives in the caller).
export { type AskFn, askLlm, resolveModel } from "../_shared/llm.js";

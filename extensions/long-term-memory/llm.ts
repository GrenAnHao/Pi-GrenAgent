// LLM helpers for memory consolidation. Implementation is shared in _shared/llm;
// MEMORY_MODEL ("provider/id") overrides ctx.model (resolution lives in the caller).
export { parseJsonLoose } from "../_shared/llm.js";
export { askLlm as askMemoryLlm, resolveModel as resolveMemoryModel } from "../_shared/llm.js";

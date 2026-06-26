// LLM helpers for the goal judge. Implementation is shared in _shared/llm;
// GOAL_MODEL ("provider/id") overrides ctx.model (resolution lives in the caller).
export { type AskFn, askLlm, parseJsonLoose, resolveModel } from "../_shared/llm.js";

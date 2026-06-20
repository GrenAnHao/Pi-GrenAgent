// Aggregate export of all extension factories, for embedding them directly
// into a branded CLI via DefaultResourceLoader's `extensionFactories` option
// (no -e / no pi install needed — they're compiled into the product).

import autoTitle from "./auto-title/index.js";
import checkpoint from "./checkpoint/index.js";
import compactionPolicy from "./compaction-policy/index.js";
import loopGuard from "./loop-guard/index.js";
import rulebook from "./rulebook/index.js";
import codeReview from "./code-review/index.js";
import codeSearch from "./code-search/index.js";
import astTools from "./ast-tools/index.js";
import github from "./github/index.js";
import batchTools from "./batch-tools/index.js";
import diagnostics from "./diagnostics/index.js";
import imGateway from "./im-gateway/index.js";
import imPlatforms from "./im-platforms/index.js";
import goal from "./goal/index.js";
import imageGen from "./image-gen/index.js";
import knowledgeRag from "./knowledge-rag/index.js";
import longTermMemory from "./long-term-memory/index.js";
import sessionMemory from "./session-memory/index.js";
import mcp from "./mcp/index.js";
import mcpPolicy from "./mcp-policy/index.js";
import multiAgent from "./multi-agent/index.js";
import codeIntel from "./code-intel/index.js";
import lsp from "./lsp/index.js";
import agentMode from "./agent-mode/index.js";
import debugTools from "./debug-tools/index.js";
import codeExec from "./code-exec/index.js";
import hashline from "./hashline/index.js";
import dap from "./dap/index.js";
import fableBehavior from "./fable-behavior/index.js";
import diagramHint from "./diagram-hint/index.js";
import safety from "./safety/index.js";
import approval from "./approval/index.js";
import todo from "./todo/index.js";
import tts from "./tts/index.js";
import webFetch from "./web-fetch/index.js";
import sessionSearch from "./session-search/index.js";
import webSearch from "./web-search/index.js";

export {
  safety,
  approval,
  loopGuard,
  rulebook,
  compactionPolicy,
  autoTitle,
  checkpoint,
  todo,
  agentMode,
  debugTools,
  dap,
  diagramHint,
  fableBehavior,
  goal,
  knowledgeRag,
  longTermMemory,
  sessionMemory,
  webFetch,
  webSearch,
  sessionSearch,
  mcp,
  mcpPolicy,
  imageGen,
  codeReview,
  diagnostics,
  multiAgent,
  codeIntel,
  lsp,
  codeSearch,
  astTools,
  github,
  batchTools,
  codeExec,
  hashline,
  tts,
  imGateway,
  imPlatforms,
};

// Order roughly by general usefulness; safety first so guardrails intercept earliest.
export const allExtensions = [
  safety,
  approval,
  loopGuard,
  rulebook,
  compactionPolicy,
  autoTitle,
  checkpoint,
  todo,
  agentMode,
  debugTools,
  dap,
  diagramHint,
  fableBehavior,
  goal,
  knowledgeRag,
  longTermMemory,
  sessionMemory,
  webFetch,
  webSearch,
  sessionSearch,
  mcp,
  mcpPolicy,
  imageGen,
  codeReview,
  diagnostics,
  multiAgent,
  codeIntel,
  lsp,
  codeSearch,
  astTools,
  github,
  batchTools,
  codeExec,
  hashline,
  tts,
  imGateway,
  imPlatforms,
];

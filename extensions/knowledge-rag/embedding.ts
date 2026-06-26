// Embedding backend for the knowledge-rag extension.
// HTTP + batching live in _shared/embedding; this module only resolves the
// KB_* provider config. When no API key is configured the store transparently
// falls back to keyword search, so the extension always works out of the box.

import { getConfig } from "../_shared/runtime-config.js";
import { resolveCapabilityEndpoint, type RegistryLike } from "../_shared/provider-endpoint.js";
import { type EmbeddingConfig, embedTexts as sharedEmbedTexts } from "../_shared/embedding.js";

export type { EmbeddingConfig };

export function resolveEmbeddingConfig(registry: RegistryLike): Promise<EmbeddingConfig> {
  return resolveCapabilityEndpoint(registry, getConfig("KB_EMBED_PROVIDER"), getConfig("KB_EMBED_MODEL"), "text-embedding-3-small");
}

export function embedTexts(texts: string[], config: EmbeddingConfig, signal?: AbortSignal): Promise<number[][]> {
  return sharedEmbedTexts(texts, config, signal, "embedding disabled: 请在设置-知识库选择 embedding 供应商");
}

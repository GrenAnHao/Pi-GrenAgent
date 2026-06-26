// Embedding backend for the long-term-memory extension.
// HTTP + batching live in _shared/embedding; this module resolves the MEMORY_*
// provider config (with a disabled fallback when no registry is available) and
// falls back to keyword search when no key is configured.

import { getConfig } from "../_shared/runtime-config.js";
import { resolveCapabilityEndpoint, type RegistryLike } from "../_shared/provider-endpoint.js";
import { type EmbeddingConfig, embedTexts as sharedEmbedTexts } from "../_shared/embedding.js";

export type { EmbeddingConfig };

export function resolveEmbeddingConfig(registry: RegistryLike | undefined): Promise<EmbeddingConfig> {
  if (!registry) {
    return Promise.resolve({
      enabled: false,
      baseUrl: "",
      apiKey: "",
      model: getConfig("MEMORY_EMBED_MODEL") ?? "text-embedding-3-small",
    });
  }
  return resolveCapabilityEndpoint(registry, getConfig("MEMORY_EMBED_PROVIDER"), getConfig("MEMORY_EMBED_MODEL"), "text-embedding-3-small");
}

export function embedTexts(texts: string[], config: EmbeddingConfig, signal?: AbortSignal): Promise<number[][]> {
  return sharedEmbedTexts(texts, config, signal, "embedding disabled: 请在设置-记忆选择 embedding 供应商");
}

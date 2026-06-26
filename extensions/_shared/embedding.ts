// Shared embedding client: resolve an OpenAI-compatible embeddings endpoint via
// the provider library and embed a batch of texts. Parameterized over the
// provider/model so each extension passes its own config keys.

import { capabilityError, capabilityFetch, type RegistryLike, resolveCapabilityEndpoint } from "./provider-endpoint.js";

export interface EmbeddingConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export function resolveEmbedding(
  registry: RegistryLike | undefined,
  provider: string | undefined,
  model: string | undefined,
  fallbackModel = "text-embedding-3-small",
): Promise<EmbeddingConfig> {
  if (!registry) {
    return Promise.resolve({ enabled: false, baseUrl: "", apiKey: "", model: (model ?? "").trim() || fallbackModel });
  }
  return resolveCapabilityEndpoint(registry, provider, model, fallbackModel);
}

const DEFAULT_DISABLED_MESSAGE = "embedding disabled: configure an embedding provider in settings";

export async function embedTexts(
  texts: string[],
  config: EmbeddingConfig,
  signal?: AbortSignal,
  disabledMessage: string = DEFAULT_DISABLED_MESSAGE,
): Promise<number[][]> {
  if (!config.enabled) throw new Error(disabledMessage);
  if (texts.length === 0) return [];
  const res = await capabilityFetch(config.baseUrl, "embeddings", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ model: config.model, input: texts }),
    signal,
  });
  if (!res.ok) throw await capabilityError("embedding API", res);
  const json = (await res.json()) as { data: Array<{ index?: number; embedding: number[] }> };
  if (json.data.length !== texts.length) {
    throw new Error(`embedding API 返回数量不符：期望 ${texts.length}，实际 ${json.data.length}`);
  }
  // 按 index 排序后再取向量：部分 OpenAI 兼容代理不保证 data 顺序与输入一致，
  // 乱序会导致向量与原文错位（召回结果错乱且极难排查）。index 缺省时保持原序（稳定排序）。
  return json.data
    .slice()
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((d) => d.embedding);
}

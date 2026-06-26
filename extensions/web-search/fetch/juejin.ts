import { fetchHtml } from "./_http.js";

const SELECTORS = [
  ".markdown-body",
  ".article-content",
  ".content",
  "[data-v-md-editor-preview]",
  ".bytemd-preview",
  ".article-area .content",
];

// 移植自 open-webSearch fetchJuejinArticle。
export async function fetchJuejinArticle(
  url: string,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<string> {
  const $ = await fetchHtml(url, signal, timeoutMs, { "accept-language": "zh-CN,zh;q=0.9" });
  for (const selector of SELECTORS) {
    const element = $(selector).first();
    if (!element.length) continue;
    element.find("script, style, .code-block-extension, .hljs-ln-numbers").remove();
    const content = element.text().trim();
    if (content.length > 100) return content;
  }
  $("script, style, nav, header, footer, .sidebar, .comment").remove();
  const fallback = $("body").text().trim();
  if (!fallback) throw new Error("Failed to extract Juejin article content");
  return fallback;
}

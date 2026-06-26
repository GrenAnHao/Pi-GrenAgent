import { fetchHtml } from "./_http.js";

function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// 移植自 open-webSearch fetchCsdnArticle（仅 HTTP + cheerio，无 Playwright 回退）。
export async function fetchCsdnArticle(
  url: string,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<string> {
  const $ = await fetchHtml(url, signal, timeoutMs);
  const article = $("#content_views").first();
  article.find("script, style, noscript").remove();
  const content = normalizeText(article.text());
  if (!content) throw new Error("Failed to extract readable CSDN article content");
  return content;
}

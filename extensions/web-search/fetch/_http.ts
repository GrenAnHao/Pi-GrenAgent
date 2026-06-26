import * as cheerio from "cheerio";

export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

/**
 * Fetch a URL as HTML and return a loaded cheerio document. An AbortController is
 * wired to `timeoutMs` (and the caller's `signal`); the timeout covers the full
 * body read. Throws on a non-OK response.
 */
export async function fetchHtml(
  url: string,
  signal: AbortSignal | undefined,
  timeoutMs: number,
  extraHeaders: Record<string, string> = {},
): Promise<cheerio.CheerioAPI> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "text/html", "user-agent": BROWSER_UA, ...extraHeaders },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return cheerio.load(await res.text());
  } finally {
    clearTimeout(timer);
  }
}

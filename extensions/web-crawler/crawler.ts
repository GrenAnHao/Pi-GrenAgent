// Multi-provider page crawler ported from lobehub's web-crawler: try several
// impls in order (with per-site URL rules) until one returns usable content.
// naive (keyless) + jina (keyless/low-friction) are always on; firecrawl / exa /
// search1api are enabled only when their API key is present.

import { extractTitle, htmlToMarkdown, htmlToText, isSafeUrl } from '../web-fetch/html.js';
import { applyUrlRules, crawlUrlRules } from './urlRules.js';

const DEFAULT_TIMEOUT = Number(process.env.CRAWL_TIMEOUT_MS ?? '15000') || 15000;
const MIN_CONTENT_LEN = 100;

export interface CrawlSuccessResult {
  content?: string;
  contentType: 'text' | 'json';
  description?: string;
  length?: number;
  siteName?: string;
  title?: string;
  url: string;
}

export interface CrawlErrorResult {
  content: string;
  errorMessage?: string;
  errorType?: string;
  url?: string;
}

export interface CrawlUniformResult {
  crawler: string;
  data: CrawlSuccessResult | CrawlErrorResult;
  originalUrl: string;
  transformedUrl?: string;
}

interface CrawlImplOptions {
  pureText?: boolean;
  signal?: AbortSignal;
}

type CrawlImpl = (url: string, opts: CrawlImplOptions) => Promise<CrawlSuccessResult | undefined>;

async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number,
  outer?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  if (outer) outer.addEventListener('abort', () => controller.abort(), { once: true });
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

// Browser-like headers to dodge naive bot blocks (mirrors lobehub naive impl).
const BROWSER_HEADERS: Record<string, string> = {
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,zh;q=0.8',
  Referer: 'https://www.google.com/',
  'Upgrade-Insecure-Requests': '1',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
};

const naive: CrawlImpl = async (url, { signal, pureText }) => {
  if (!isSafeUrl(url).ok) return undefined;
  let res: Response;
  try {
    res = await withTimeout(
      (s) => fetch(url, { headers: BROWSER_HEADERS, redirect: 'follow', signal: s }),
      DEFAULT_TIMEOUT,
      signal,
    );
  } catch {
    return undefined;
  }
  if (res.status === 404 || !res.ok) return undefined;

  const type = res.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    let content: string;
    try {
      content = JSON.stringify(await res.clone().json(), null, 2);
    } catch {
      content = await res.text();
    }
    return { content, contentType: 'json', length: content.length, url };
  }

  const html = await res.text();
  const title = extractTitle(html);
  if (title === 'Just a moment...') return undefined; // Cloudflare interstitial
  const content = pureText ? htmlToText(html) : htmlToMarkdown(html);
  if (!content || content.length < MIN_CONTENT_LEN) return undefined;
  return { content, contentType: 'text', length: content.length, title, url };
};

const jina: CrawlImpl = async (url, { signal }) => {
  const base = process.env.JINA_READER_BASE_URL || 'https://r.jina.ai';
  const token = process.env.JINA_READER_API_KEY || process.env.JINA_API_KEY;
  let res: Response;
  try {
    res = await withTimeout(
      (s) =>
        fetch(`${base}/${url}`, {
          headers: {
            Accept: 'application/json',
            Authorization: token ? `Bearer ${token}` : '',
            'x-send-from': 'Pi Agent',
          },
          signal: s,
        }),
      DEFAULT_TIMEOUT,
      signal,
    );
  } catch {
    return undefined;
  }
  if (!res.ok) return undefined;
  let json: { code?: number; data?: { content?: string; description?: string; siteName?: string; title?: string } };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    return undefined;
  }
  const data = json?.data;
  if (json?.code !== 200 || !data?.content || data.content.length < MIN_CONTENT_LEN) return undefined;
  return {
    content: data.content,
    contentType: 'text',
    description: data.description,
    length: data.content.length,
    siteName: data.siteName,
    title: data.title,
    url,
  };
};

const firecrawl: CrawlImpl = async (url, { signal }) => {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return undefined;
  const base = process.env.FIRECRAWL_URL || 'https://api.firecrawl.dev/v2';
  let res: Response;
  try {
    res = await withTimeout(
      (s) =>
        fetch(`${base}/scrape`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ formats: ['markdown'], url }),
          signal: s,
        }),
      DEFAULT_TIMEOUT,
      signal,
    );
  } catch {
    return undefined;
  }
  if (!res.ok) return undefined;
  let json: { data?: { markdown?: string; metadata?: { description?: string; title?: string } } };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    return undefined;
  }
  const md = json?.data?.markdown;
  if (!md || md.length < MIN_CONTENT_LEN) return undefined;
  return {
    content: md,
    contentType: 'text',
    description: json.data?.metadata?.description ?? '',
    length: md.length,
    siteName: safeHost(url),
    title: json.data?.metadata?.title ?? '',
    url,
  };
};

const exa: CrawlImpl = async (url, { signal }) => {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) return undefined;
  let res: Response;
  try {
    res = await withTimeout(
      (s) =>
        fetch('https://api.exa.ai/contents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
          body: JSON.stringify({ livecrawl: 'fallback', text: true, urls: [url] }),
          signal: s,
        }),
      DEFAULT_TIMEOUT,
      signal,
    );
  } catch {
    return undefined;
  }
  if (!res.ok) return undefined;
  let json: { results?: Array<{ text?: string; title?: string; url?: string }> };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    return undefined;
  }
  const first = json?.results?.[0];
  if (!first?.text || first.text.length < MIN_CONTENT_LEN) return undefined;
  return {
    content: first.text,
    contentType: 'text',
    length: first.text.length,
    siteName: safeHost(url),
    title: first.title,
    url: first.url || url,
  };
};

const search1api: CrawlImpl = async (url, { signal }) => {
  const apiKey = process.env.SEARCH1API_CRAWL_API_KEY || process.env.SEARCH1API_API_KEY;
  if (!apiKey) return undefined;
  let res: Response;
  try {
    res = await withTimeout(
      (s) =>
        fetch('https://api.search1api.com/crawl', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
          signal: s,
        }),
      DEFAULT_TIMEOUT,
      signal,
    );
  } catch {
    return undefined;
  }
  if (!res.ok) return undefined;
  let json: { results?: { content?: string; link?: string; title?: string } };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    return undefined;
  }
  const c = json?.results?.content;
  if (!c || c.length < MIN_CONTENT_LEN) return undefined;
  return {
    content: c,
    contentType: 'text',
    description: json.results?.title,
    length: c.length,
    siteName: safeHost(url),
    title: json.results?.title,
    url: json.results?.link || url,
  };
};

const ALL_IMPLS: Record<string, CrawlImpl> = { naive, jina, firecrawl, exa, search1api };

/**
 * Impls usable in this environment, in fallback order. jina first (clean reader
 * extraction, matches lobe's default) so content-heavy pages don't come back as
 * raw nav/menu junk; naive as keyless fallback; keyed providers only with a key.
 */
export function availableImpls(): string[] {
  const list = ['jina', 'naive'];
  if (process.env.FIRECRAWL_API_KEY) list.push('firecrawl');
  if (process.env.EXA_API_KEY) list.push('exa');
  if (process.env.SEARCH1API_CRAWL_API_KEY || process.env.SEARCH1API_API_KEY) list.push('search1api');
  return list;
}

export class Crawler {
  impls: string[];

  constructor(impls?: string[]) {
    const avail = availableImpls();
    // Allow ordering/selection override via CRAWL_IMPLS="naive,jina" etc.
    const envImpls = process.env.CRAWL_IMPLS?.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const requested = impls?.length ? impls : envImpls;
    this.impls = requested?.length ? requested.filter((i) => avail.includes(i)) : avail;
  }

  async crawl(opts: {
    url: string;
    signal?: AbortSignal;
    impls?: string[];
  }): Promise<CrawlUniformResult> {
    const { url, signal } = opts;
    const { transformedUrl, impls: ruleImpls, pureText } = applyUrlRules(url, crawlUrlRules);

    const ruleFiltered = ruleImpls?.filter((i) => this.impls.includes(i));
    const systemImpls = ruleFiltered?.length ? ruleFiltered : this.impls;
    const finalImpls = opts.impls?.filter((i) => i in ALL_IMPLS) ?? systemImpls;

    let lastError: string | undefined;
    let lastCrawler: string | undefined;

    for (const impl of finalImpls) {
      const fn = ALL_IMPLS[impl];
      if (!fn) continue;
      try {
        const res = await fn(transformedUrl, { pureText, signal });
        if (res?.content && res.content.length > MIN_CONTENT_LEN) {
          return {
            crawler: impl,
            data: res,
            originalUrl: url,
            transformedUrl: transformedUrl !== url ? transformedUrl : undefined,
          };
        }
        lastError = `${impl} 返回空/过短内容`;
        lastCrawler = impl;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        lastCrawler = impl;
      }
    }

    return {
      crawler: lastCrawler || finalImpls.at(-1) || 'unknown',
      data: {
        content: `抓取失败（${lastCrawler ?? 'unknown'}）：${lastError ?? '未知错误'}`,
        errorMessage: lastError,
        errorType: 'CrawlFailed',
        url,
      },
      originalUrl: url,
      transformedUrl: transformedUrl !== url ? transformedUrl : undefined,
    };
  }
}

let shared: Crawler | undefined;
/** Process-wide crawler (impls resolved from env once). */
export function getCrawler(): Crawler {
  if (!shared) shared = new Crawler();
  return shared;
}

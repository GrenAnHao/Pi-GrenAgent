// CJK-aware keyword frequency score — the no-embedding fallback shared by the
// knowledge-rag / long-term-memory stores. Matches ASCII words and CJK runs
// (length > 1) so keyword search works for Chinese too (a plain \W+ split drops
// CJK characters entirely). Score is hit count normalized by sqrt(text length).
export function keywordScore(query: string, text: string): number {
  const terms = (query.toLowerCase().match(/[\w\u4e00-\u9fff]+/g) ?? []).filter((t) => t.length > 1);
  if (!terms.length) return 0;
  const hay = text.toLowerCase();
  let hits = 0;
  for (const term of terms) {
    let idx = hay.indexOf(term);
    while (idx !== -1) {
      hits++;
      idx = hay.indexOf(term, idx + term.length);
    }
  }
  return hits / Math.sqrt(text.length + 1);
}

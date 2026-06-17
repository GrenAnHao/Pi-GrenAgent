import type { GhAction } from "./args.js";

interface Actor {
  login?: string;
}
interface Label {
  name?: string;
}

function labels(ls?: Label[]): string {
  return ls && ls.length ? ` [${ls.map((l) => l.name).filter(Boolean).join(", ")}]` : "";
}

function formatPr(d: Record<string, unknown>): string {
  const author = (d.author as Actor | undefined)?.login ?? "?";
  const head = `#${d.number} ${d.title}  [${d.state}${d.isDraft ? ", draft" : ""}]`;
  const meta = `作者 ${author} | ${d.headRefName} → ${d.baseRefName}${labels(d.labels as Label[])}`;
  return [head, meta, String(d.url ?? ""), "", String(d.body ?? "").trim()].join("\n").trim();
}

function formatIssue(d: Record<string, unknown>): string {
  const author = (d.author as Actor | undefined)?.login ?? "?";
  const head = `#${d.number} ${d.title}  [${d.state}]`;
  const meta = `作者 ${author}${labels(d.labels as Label[])}`;
  return [head, meta, String(d.url ?? ""), "", String(d.body ?? "").trim()].join("\n").trim();
}

function formatRepo(d: Record<string, unknown>): string {
  const lang = (d.primaryLanguage as { name?: string } | undefined)?.name ?? "?";
  return [
    String(d.nameWithOwner ?? ""),
    String(d.description ?? ""),
    `star ${d.stargazerCount ?? 0} | fork ${d.forkCount ?? 0} | ${lang}`,
    String(d.url ?? ""),
  ]
    .filter(Boolean)
    .join("\n");
}

function formatList(rows: Array<Record<string, unknown>>, kind: string): string {
  if (!rows.length) return `(无 ${kind})`;
  return rows
    .map((r) => {
      const author = (r.author as Actor | undefined)?.login ?? "?";
      return `#${r.number} [${r.state}] ${r.title}  — ${author}`;
    })
    .join("\n");
}

export function formatResult(action: GhAction, raw: string): string {
  if (action === "pr_diff" || action === "code_search") return raw.trim() || "(空)";
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return raw.trim();
  }
  switch (action) {
    case "pr_view":
      return formatPr(data as Record<string, unknown>);
    case "issue_view":
      return formatIssue(data as Record<string, unknown>);
    case "repo_view":
      return formatRepo(data as Record<string, unknown>);
    case "pr_list":
      return formatList(data as Array<Record<string, unknown>>, "PR");
    case "issue_list":
      return formatList(data as Array<Record<string, unknown>>, "Issue");
    default:
      return raw.trim();
  }
}

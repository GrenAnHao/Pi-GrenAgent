export type GhAction =
  | "pr_view"
  | "pr_diff"
  | "issue_view"
  | "repo_view"
  | "pr_list"
  | "issue_list"
  | "code_search";

export interface GhParams {
  repo?: string;
  number?: number;
  query?: string;
  state?: string;
  limit?: number;
}

const PR_FIELDS =
  "number,title,state,author,body,createdAt,updatedAt,url,baseRefName,headRefName,isDraft,labels";
const ISSUE_FIELDS = "number,title,state,author,body,createdAt,updatedAt,url,labels";
const REPO_FIELDS =
  "nameWithOwner,description,url,stargazerCount,forkCount,primaryLanguage,defaultBranchRef,updatedAt";
const LIST_FIELDS = "number,title,state,author,updatedAt";

function reqNumber(p: GhParams): string {
  if (p.number === undefined || !Number.isFinite(p.number)) {
    throw new Error("该 action 需要 number（PR/issue 号）");
  }
  return String(p.number);
}

function reqQuery(p: GhParams): string {
  if (!p.query || !p.query.trim()) throw new Error("code_search 需要 query");
  return p.query;
}

export function buildGhArgs(action: GhAction, p: GhParams): string[] {
  const repoFlag = p.repo ? ["--repo", p.repo] : [];
  const state = p.state ?? "open";
  const limit = String(p.limit ?? 30);
  switch (action) {
    case "pr_view":
      return ["pr", "view", reqNumber(p), ...repoFlag, "--json", PR_FIELDS];
    case "pr_diff":
      return ["pr", "diff", reqNumber(p), ...repoFlag];
    case "issue_view":
      return ["issue", "view", reqNumber(p), ...repoFlag, "--json", ISSUE_FIELDS];
    case "repo_view":
      return ["repo", "view", ...(p.repo ? [p.repo] : []), "--json", REPO_FIELDS];
    case "pr_list":
      return ["pr", "list", ...repoFlag, "--state", state, "--limit", limit, "--json", LIST_FIELDS];
    case "issue_list":
      return ["issue", "list", ...repoFlag, "--state", state, "--limit", limit, "--json", LIST_FIELDS];
    case "code_search":
      return ["search", "code", reqQuery(p), "--limit", limit];
  }
}

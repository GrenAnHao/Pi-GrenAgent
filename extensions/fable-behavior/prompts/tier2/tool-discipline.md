## Tool discipline

Tool priority for code exploration:
1. Code intelligence / LSP tools when available (`explore_context`, codebase-memory tools like `search_graph`/`query_graph`/`trace_path`, `lsp_*`)
2. `grep`, `find`, `glob`, `search`, `code_search` (see grep-strategy)
3. `bash` only for git, builds, tests, and true shell operations

- Parallelize independent tool calls in one turn; batch reads and searches.
- Chain dependent bash with `&&`.
- Stay within the workspace unless the task requires otherwise.

Before starting dev servers, check existing terminals/processes to avoid duplicates.

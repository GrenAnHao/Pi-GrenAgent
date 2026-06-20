## Verify baseline

Before and after code changes:

- Run only linters, builds, and tests that already exist in the repo — do not introduce new tooling unless the task requires it.
- Establish a baseline when helpful (lint/test once before edits), then re-run after changes to catch regressions.
- Prefer ecosystem commands from README, `package.json`, `AGENTS.md`, or Makefile over guessing framework scripts.
- Documentation-only edits skip build/test unless the repo has doc-specific checks.
- If the correct verify command is unknown, ask once; suggest recording it in project docs for next time.

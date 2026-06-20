## Git hygiene

- Only create commits when the user asks.
- Never update git config; never run destructive git commands unless explicitly requested.
- Never revert changes you did not make; ignore unrelated dirty files.
- If unexpected changes conflict with your task, stop and ask.
- Avoid interactive git (`rebase -i`, etc.); use non-interactive commands.
- Stage specific files by name; avoid `git add -A` / `git add .` (secrets and binaries).
- After a failed pre-commit hook, fix and create a new commit — do not `--amend` the previous commit.
- Do not amend commits unless explicitly requested and safe per project rules.

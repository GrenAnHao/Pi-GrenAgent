## Editing constraints

- Default to ASCII in new or edited files. Use non-ASCII only when the file already uses it or the user requires it.
- Use dedicated edit/write tools for file changes — not shell redirection (`cat >`, heredocs) for source edits.
- Add brief comments only when a block is genuinely hard to parse; never narrate obvious assignments.
- Do not use scripting languages to read/write files when a direct read/edit tool suffices.
- Prefer formatting or bulk refactors through edit tools, not one-off shell transforms on source trees.

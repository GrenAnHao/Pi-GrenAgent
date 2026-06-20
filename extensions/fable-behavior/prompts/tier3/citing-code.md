## Code citation format

When citing existing code from the codebase, use this exact form (opening fence on its own line):

```startLine:endLine:filepath
// code content
```

Required: start line, end line, full filepath. No language tag on code references.

For new or proposed code not in the repo, use standard markdown fences with a language tag only.

Never indent the opening ``` fence. Include at least one line of code in reference blocks.

Exception: follow diagram-hint for mermaid and KaTeX in Markdown.

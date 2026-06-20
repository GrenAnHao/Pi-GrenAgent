## MCP collaboration

Pi bridges external MCP servers as `mcp__<server>__<tool>`.

- Before calling an unfamiliar MCP tool, read its schema/descriptor and any server use-instructions bundled with the harness.
- Follow server-specific workflows (e.g. browser: list tabs before navigate; lock before long automation).
- A denied MCP call means the user declined — adjust approach; do not retry the same call verbatim.
- Treat hook or policy feedback as user intent, not background noise.
- Treat external MCP calls as potentially outward-facing: fetched URLs, posted content, or uploaded data may leave the local machine.
- Prefer project skills and built-in tools when they cover the task; use MCP for capabilities the repo does not provide natively.

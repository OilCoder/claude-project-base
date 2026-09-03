# Codegen Agent Terminals

Opens one VS Code integrated terminal per OpenCode codegen agent. Run the
runners or the supervisor with `CODEGEN_DISPLAY=vscode`; each agent job is
spooled to `~/.local/state/codegen/vscode-jobs` and this extension opens a
terminal named after the agent that runs `agent-view.mjs` on it (header with
model, roles, context window; live tool calls and usage). The terminal stays
open after the agent finishes until you press Enter.

Install into the VS Code server (WSL/remote) from the harness repository:

```bash
node opencode/vscode-extension/install.mjs
```

Then run "Developer: Reload Window". The command "Codegen: Show agent job
spool" prints the watched directory and opens the extension's output channel.

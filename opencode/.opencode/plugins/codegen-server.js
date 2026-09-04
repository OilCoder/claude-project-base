// Publishes the URL of the OpenCode server that loaded this plugin (the
// supervisor's TUI) so the codegen runners can attach their agent sessions to
// it with `opencode run --attach`. Those sessions then appear in the user's
// session list instead of running invisibly.
//
// The file is never removed here: worktree instances load this same plugin
// through the linked .opencode layer, and their disposal must not delete the
// supervisor's entry. Readers check the pid and the URL before trusting it.
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

export const CodegenServer = async ({ serverUrl, directory, worktree }) => {
  // `opencode run` starts its own in-process server; only the interactive
  // server (the TUI or `opencode serve`) is worth publishing.
  if (process.argv.includes("run")) return {}
  const root = worktree || directory
  const file = path.join(root, ".opencode", ".codegen-server.json")
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify({ url: String(serverUrl), pid: process.pid, at: new Date().toISOString() })}\n`)
  return {}
}

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

export const CodegenServer = async ({ serverUrl, directory }) => {
  // `opencode run` starts its own in-process server; only the interactive
  // server (the TUI or `opencode serve`) is worth publishing.
  if (process.argv.includes("run")) return {}
  // `directory` is the instance directory (where this .opencode lives), which
  // is also what the codegen_workflow tool receives as context.directory. The
  // git root would be wrong for a project that lives inside a larger repository.
  const file = path.join(directory, ".opencode", ".codegen-server.json")
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify({ url: String(serverUrl), pid: process.pid, at: new Date().toISOString() })}\n`)
  return {}
}

import { readFile } from "node:fs/promises"
import path from "node:path"

import { runProcess } from "./process.mjs"

// `inline` captures the agent's JSON events silently. `tui` attaches the agent
// session to the supervisor's running OpenCode server (CODEGEN_ATTACH), so the
// user watches it in the OpenCode session list with OpenCode's own rendering.
// Classification and metrics read the same NDJSON in both displays.
export const DISPLAYS = ["inline", "tui"]
export const SERVER_FILE = ".opencode/.codegen-server.json"

export function resolveDisplay(args = {}) {
  const display = args.display ?? process.env.CODEGEN_DISPLAY ?? "inline"
  if (!DISPLAYS.includes(display)) {
    throw new Error(
      `Unknown display ${display}; use ${DISPLAYS.join(" or ")}. The tmux, wt, and vscode views were removed on 2026-09-03: drop CODEGEN_DISPLAY=${display} from your shell.`,
    )
  }
  return display
}

// The plugin .opencode/plugins/codegen-server.js writes this file when the
// interactive server starts. A stale entry (dead pid or unreachable URL) means
// there is nothing to attach to.
export async function readServerFile(projectRoot) {
  try {
    const server = JSON.parse(await readFile(path.join(projectRoot, SERVER_FILE), "utf8"))
    if (typeof server.url !== "string" || !Number.isInteger(server.pid)) return null
    // Node and Bun may resolve localhost to ::1 while the server binds 127.0.0.1.
    return { ...server, url: server.url.replace(/^http:\/\/localhost([:/])/, "http://127.0.0.1$1") }
  } catch {
    return null
  }
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === "EPERM"
  }
}

export async function serverAlive(server, { timeoutMs = 2000 } = {}) {
  if (!server || !pidAlive(server.pid)) return false
  try {
    const response = await fetch(new URL("/doc", server.url), { signal: AbortSignal.timeout(timeoutMs) })
    return response.ok
  } catch {
    return false
  }
}

// `published` tells whether a server file exists at all: a TUI started
// without --port publishes a nominal URL nothing listens on.
export async function resolveAttachUrl(projectRoot) {
  const server = await readServerFile(projectRoot)
  return { url: (await serverAlive(server)) ? server.url : null, published: server?.url ?? null }
}

// Runs `opencode run ...` for one agent. `args` starts with "run"; the tui
// display inserts the attach flags right after it. An agent that produces no
// event within firstOutputSeconds is killed and classified as a runner error
// instead of holding the run until the full timeout.
export async function runAgentProcess({
  directory,
  args,
  env = {},
  timeoutSeconds = 900,
  display = "inline",
  title = null,
  firstOutputSeconds = Number(process.env.CODEGEN_FIRST_OUTPUT_SECONDS ?? 120),
}) {
  if (!DISPLAYS.includes(display)) throw new Error(`Unknown display ${display}`)
  const command = [...args]
  if (display === "tui") {
    const url = process.env.CODEGEN_ATTACH
    if (!url) {
      throw new Error("display tui needs CODEGEN_ATTACH=<url of the supervisor's OpenCode server>; start from the supervisor or use --display inline")
    }
    command.splice(1, 0, "--attach", url, "--dir", directory, ...(title ? ["--title", title] : []))
  }
  return runProcess("opencode", command, { cwd: directory, timeoutSeconds, env, firstOutputSeconds })
}

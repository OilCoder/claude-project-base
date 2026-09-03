import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { runProcess } from "./process.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const viewScript = path.resolve(here, "../scripts/agent-view.mjs")
const rolesFile = path.resolve(here, "../config/agent-roles.json")

export const DISPLAYS = ["inline", "tmux", "wt"]

export function resolveDisplay(args = {}) {
  const display = args.display ?? process.env.CODEGEN_DISPLAY ?? "tmux"
  if (!DISPLAYS.includes(display)) throw new Error(`Unknown display ${display}; use ${DISPLAYS.join(", ")}`)
  return display
}

export async function agentRoles(agent) {
  try {
    return JSON.parse(await readFile(rolesFile, "utf8"))[agent] ?? []
  } catch {
    return []
  }
}

async function exists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// The terminal shell is spawned by tmux or Windows Terminal, so the job carries the
// environment the agent needs instead of inheriting ours.
const ENV_KEEP = /^(PATH|HOME|USER|LOGNAME|SHELL|LANG|LC_|TERM|TMPDIR|XDG_|NO_COLOR|OPENCODE_|CODEGEN_|NODE_|FAKE_|PYTHON)/

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`
}

// Runs `opencode run ...` for one agent. `inline` keeps the piped behavior.
// `tmux` / `wt` open a terminal running agent-view.mjs and wait for its done
// file; the raw events are read back so classification and metrics are the
// same in every display.
export async function runAgentProcess({
  directory,
  args,
  env = {},
  timeoutSeconds = 900,
  display = "inline",
  header = {},
  artifacts,
  hold = true,
}) {
  if (display === "inline") {
    return runProcess("opencode", args, { cwd: directory, timeoutSeconds, env })
  }
  if (!artifacts) throw new Error("A terminal display needs an artifacts directory for the job files")
  await mkdir(artifacts, { recursive: true })
  const slug = `${(header.title ?? header.agent ?? "agent").replaceAll(/[^A-Za-z0-9._-]+/g, "-")}-${Date.now()}`
  const jobFile = path.join(artifacts, `${slug}.job.json`)
  const job = {
    directory,
    command: "opencode",
    args,
    env: Object.fromEntries(Object.entries({ ...process.env, ...env }).filter(([key]) => ENV_KEEP.test(key))),
    timeout_seconds: timeoutSeconds,
    header,
    events_file: path.join(artifacts, `${slug}.events.jsonl`),
    stderr_file: path.join(artifacts, `${slug}.stderr.txt`),
    done_file: path.join(artifacts, `${slug}.done.json`),
    hold: hold && process.env.CODEGEN_VIEW_HOLD !== "0",
  }
  await writeFile(jobFile, `${JSON.stringify(job, null, 2)}\n`)
  const command = `${shellQuote(process.execPath)} ${shellQuote(viewScript)} ${shellQuote(jobFile)}`
  const title = header.title ?? header.agent ?? "agent"

  if (display === "tmux") await openTmuxWindow({ command, title, hold: job.hold })
  else if (display === "wt") await openWindowsTerminalTab({ command, title })

  const deadline = Date.now() + (timeoutSeconds + 60) * 1000
  while (!(await exists(job.done_file))) {
    if (Date.now() > deadline) {
      return { exitCode: 124, signal: null, stdout: "", stderr: `agent view for ${title} did not finish` }
    }
    await sleep(250)
  }
  const done = JSON.parse(await readFile(job.done_file, "utf8"))
  return {
    exitCode: done.exit_code,
    signal: done.signal,
    stdout: (await exists(job.events_file)) ? await readFile(job.events_file, "utf8") : "",
    stderr: (await exists(job.stderr_file)) ? await readFile(job.stderr_file, "utf8") : "",
  }
}

function tmuxBase() {
  const socket = process.env.CODEGEN_TMUX_SOCKET
  return socket ? ["-L", socket] : []
}

async function tmux(args, { allowFailure = false } = {}) {
  const result = await runProcess("tmux", [...tmuxBase(), ...args], { timeoutSeconds: 30 })
  if (result.exitCode !== 0 && !allowFailure) {
    throw new Error(`tmux ${args.join(" ")} failed: ${result.stderr.trim()}`)
  }
  return result
}

// Every agent gets a separate window. Outside tmux, use or create a detached
// session (CODEGEN_TMUX_SESSION, default "codegen") that can be attached later.
async function openTmuxWindow({ command, title, hold }) {
  const insideTmux = Boolean(process.env.TMUX) && !process.env.CODEGEN_TMUX_SOCKET
  const session = process.env.CODEGEN_TMUX_SESSION ?? "codegen"
  if (!insideTmux) {
    const has = await tmux(["has-session", "-t", session], { allowFailure: true })
    if (has.exitCode !== 0) await tmux(["new-session", "-d", "-s", session, "-n", "codegen"])
  }
  // "session:" means the next free window index in that session.
  const target = insideTmux ? [] : ["-t", `${session}:`]
  const result = await tmux(["new-window", "-d", "-P", "-F", "#{pane_id}", ...target, "-n", title, command])
  const pane = result.stdout.trim()
  await tmux(["select-pane", "-t", pane, "-T", title], { allowFailure: true })
  // With hold, the view waits for Enter and the window closes on exit. Without
  // it, keep the dead window so the output can still be read.
  if (!hold) await tmux(["set-option", "-p", "-t", pane, "remain-on-exit", "on"], { allowFailure: true })
  return pane
}

// Windows Terminal from WSL: one new tab per agent. Not exercised by tests.
async function openWindowsTerminalTab({ command, title }) {
  const result = await runProcess(
    "wt.exe",
    ["-w", "0", "new-tab", "--title", title, "wsl.exe", "-e", "bash", "-lc", command],
    { timeoutSeconds: 30 },
  )
  if (result.exitCode !== 0) throw new Error(`wt.exe failed: ${result.stderr.trim()}`)
}

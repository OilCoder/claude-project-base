// Codegen Agent Terminals: one integrated terminal per agent job.
//
// The runners (CODEGEN_DISPLAY=vscode) drop a job file into the spool
// directory. This extension polls it, opens a terminal named after the agent,
// runs agent-view.mjs on the job there, and removes the spool entry. The
// runner itself waits for the done file the view writes, so classification
// and metrics are identical to the tmux display.
const vscode = require("vscode")
const fs = require("fs")
const os = require("os")
const path = require("path")

const POLL_MS = 1000

function spoolDirectory() {
  const configured = vscode.workspace.getConfiguration("codegenAgentTerminals").get("spoolDirectory")
  return configured || path.join(os.homedir(), ".local/state/codegen/vscode-jobs")
}

function quote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

function openTerminal(jobFile) {
  let job
  try {
    job = JSON.parse(fs.readFileSync(jobFile, "utf8"))
  } catch {
    return false // still being written; retry on the next poll
  }
  const name = job.header?.title ?? job.header?.agent ?? "agent"
  const node = vscode.workspace.getConfiguration("codegenAgentTerminals").get("node") || "node"
  const terminal = vscode.window.createTerminal({ name, cwd: job.directory })
  terminal.show(true)
  terminal.sendText(`${quote(node)} ${quote(job.view_script)} ${quote(jobFile.replace(/\.job\.json$/, ".taken.job.json"))}`)
  return true
}

function poll(spool, output) {
  let entries
  try {
    entries = fs.readdirSync(spool)
  } catch {
    return
  }
  for (const entry of entries) {
    if (!entry.endsWith(".job.json") || entry.endsWith(".taken.job.json")) continue
    const jobFile = path.join(spool, entry)
    const taken = jobFile.replace(/\.job\.json$/, ".taken.job.json")
    // Claim the job before the terminal starts so a second poll never opens it twice.
    try {
      fs.renameSync(jobFile, taken)
    } catch {
      continue
    }
    if (openTerminal(taken)) output.appendLine(`opened terminal for ${entry}`)
    else fs.renameSync(taken, jobFile)
  }
}

function activate(context) {
  const output = vscode.window.createOutputChannel("Codegen Agent Terminals")
  const spool = spoolDirectory()
  fs.mkdirSync(spool, { recursive: true })
  output.appendLine(`watching ${spool}`)
  const timer = setInterval(() => poll(spool, output), POLL_MS)
  context.subscriptions.push({ dispose: () => clearInterval(timer) })
  context.subscriptions.push(
    vscode.commands.registerCommand("codegenAgentTerminals.showSpool", () => {
      vscode.window.showInformationMessage(`Codegen agent job spool: ${spool}`)
      output.show(true)
    }),
  )
}

function deactivate() {}

module.exports = { activate, deactivate }

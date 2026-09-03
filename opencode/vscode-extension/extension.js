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

// Only jobs whose project lives inside this window's workspace folders are
// claimed, so several VS Code windows can share the spool without stealing
// each other's agents.
function ownsJob(job) {
  const folders = (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath)
  if (folders.length === 0) return false
  let directory = String(job.directory ?? "")
  try {
    directory = fs.realpathSync(directory)
  } catch {
    // keep the raw path
  }
  return folders.some((folder) => {
    let root = folder
    try {
      root = fs.realpathSync(folder)
    } catch {
      // keep the raw path
    }
    return directory === root || directory.startsWith(`${root}${path.sep}`)
  })
}

function readJob(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"))
  } catch {
    return null // still being written; retry on the next poll
  }
}

function quote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

function openTerminal(jobFile, output) {
  let job
  try {
    job = JSON.parse(fs.readFileSync(jobFile, "utf8"))
  } catch {
    return false // still being written; retry on the next poll
  }
  const name = job.header?.title ?? job.header?.agent ?? "agent"
  const configured = vscode.workspace.getConfiguration("codegenAgentTerminals").get("node")
  const node = (configured && configured !== "node") ? configured : (job.node || "node")
  // The terminal runs the view directly as its process: no shell startup, no
  // PATH lookup, no text injection. With hold, the view waits for Enter.
  const terminal = vscode.window.createTerminal({
    name,
    cwd: job.directory,
    shellPath: node,
    shellArgs: [job.view_script, jobFile],
    env: { CODEGEN_VIEW_HOLD: job.hold ? "1" : "0" },
  })
  terminal.show(true)
  output.appendLine(`terminal "${name}": ${node} ${job.view_script} ${jobFile}`)
  return true
}

// Jobs claimed by a previous window (for example before a reload) are reopened
// if their runner is still waiting, or dropped if the view already finished.
function recover(spool, output) {
  let entries
  try {
    entries = fs.readdirSync(spool)
  } catch {
    return
  }
  for (const entry of entries) {
    if (!entry.endsWith(".taken.job.json")) continue
    const taken = path.join(spool, entry)
    try {
      const job = JSON.parse(fs.readFileSync(taken, "utf8"))
      if (!ownsJob(job)) continue
      if (job.done_file && fs.existsSync(job.done_file)) {
        fs.unlinkSync(taken)
        continue
      }
      fs.renameSync(taken, taken.replace(/\.taken\.job\.json$/, ".job.json"))
      output.appendLine(`recovered pending job ${entry}`)
    } catch (error) {
      output.appendLine(`cannot recover ${entry}: ${error.message}`)
    }
  }
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
    const pending = readJob(jobFile)
    if (!pending || !ownsJob(pending)) continue
    const taken = jobFile.replace(/\.job\.json$/, ".taken.job.json")
    // Claim the job before the terminal starts so a second poll never opens it twice.
    try {
      fs.renameSync(jobFile, taken)
    } catch {
      continue
    }
    try {
      if (!openTerminal(taken, output)) fs.renameSync(taken, jobFile)
    } catch (error) {
      output.appendLine(`cannot open terminal for ${entry}: ${error.stack ?? error.message}`)
      vscode.window.showErrorMessage(`Codegen agent terminal failed: ${error.message}`)
    }
  }
}

function activate(context) {
  const output = vscode.window.createOutputChannel("Codegen Agent Terminals")
  const spool = spoolDirectory()
  fs.mkdirSync(spool, { recursive: true })
  output.appendLine(`watching ${spool} for ${(vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath).join(", ") || "(no workspace)"}`)
  recover(spool, output)
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

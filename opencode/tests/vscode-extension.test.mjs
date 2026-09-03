// Loads the real extension.js with a stubbed `vscode` module and drives the
// spool the way the runners do, so a missing helper or a broken claim cannot
// ship again (0.1.4 shipped without `poll` and never opened a terminal).
import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import test from "node:test"

const require = createRequire(import.meta.url)
const Module = require("node:module")

function loadExtension({ folders, terminals, lines }) {
  const stub = {
    workspace: {
      getConfiguration: () => ({ get: () => undefined }),
      workspaceFolders: folders.map((fsPath) => ({ uri: { fsPath } })),
    },
    window: {
      createOutputChannel: () => ({ appendLine: (line) => lines.push(line), show() {} }),
      createTerminal: (options) => {
        terminals.push(options)
        return { show() {} }
      },
      showErrorMessage: (message) => lines.push(`error: ${message}`),
    },
    commands: { registerCommand: () => ({ dispose() {} }) },
  }
  const original = Module._load
  Module._load = function (request, ...rest) {
    return request === "vscode" ? stub : original.call(this, request, ...rest)
  }
  try {
    const file = path.resolve("vscode-extension/extension.js")
    delete require.cache[file]
    return require(file)
  } finally {
    Module._load = original
  }
}

function spoolWithJob(directory, name = "goal-manager-job") {
  const spool = mkdtempSync(path.join(os.tmpdir(), "codegen-spool-"))
  const doneFile = path.join(directory, "done.json")
  const job = { header: { title: "Goal Manager", agent: "goal-manager" }, directory, view_script: "/x/agent-view.mjs", node: "/x/node", hold: true, done_file: doneFile }
  writeFileSync(path.join(spool, `${name}.job.json`), JSON.stringify(job))
  return { spool, job, doneFile }
}

test("poll claims a job of this workspace, records the owner and opens one terminal", () => {
  const project = mkdtempSync(path.join(os.tmpdir(), "codegen-project-"))
  const terminals = []
  const lines = []
  const ext = loadExtension({ folders: [project], terminals, lines })
  const { spool, job } = spoolWithJob(project)
  ext.poll(spool, { appendLine: (line) => lines.push(line) })
  ext.poll(spool, { appendLine: (line) => lines.push(line) })
  assert.equal(terminals.length, 1, lines.join("\n"))
  assert.equal(terminals[0].name, "Goal Manager")
  assert.equal(terminals[0].shellPath, job.node)
  assert.equal(terminals[0].shellArgs[0], job.view_script)
  assert.equal(terminals[0].cwd, project)
  const entries = readdirSync(spool).sort()
  assert.deepEqual(entries, ["goal-manager-job.taken.job.json", "goal-manager-job.taken.job.json.owner"])
  const owner = JSON.parse(readFileSyncText(path.join(spool, entries[1])))
  assert.equal(owner.pid, process.pid)
})

test("poll ignores jobs of other workspaces", () => {
  const project = mkdtempSync(path.join(os.tmpdir(), "codegen-project-"))
  const other = mkdtempSync(path.join(os.tmpdir(), "codegen-other-"))
  const terminals = []
  const ext = loadExtension({ folders: [other], terminals, lines: [] })
  const { spool } = spoolWithJob(project)
  ext.poll(spool, { appendLine() {} })
  assert.equal(terminals.length, 0)
  assert.deepEqual(readdirSync(spool), ["goal-manager-job.job.json"])
})

test("releaseAbandoned removes finished claims and re-offers claims of a dead owner", () => {
  const project = mkdtempSync(path.join(os.tmpdir(), "codegen-project-"))
  const ext = loadExtension({ folders: [project], terminals: [], lines: [] })
  const spool = mkdtempSync(path.join(os.tmpdir(), "codegen-spool-"))
  const job = { directory: project, done_file: path.join(project, "done.json") }
  const finished = path.join(spool, "a.taken.job.json")
  writeFileSync(finished, JSON.stringify(job))
  writeFileSync(`${finished}.owner`, JSON.stringify({ pid: process.pid }))
  writeFileSync(job.done_file, "{}")
  const dead = path.join(spool, "b.taken.job.json")
  writeFileSync(dead, JSON.stringify({ directory: project, done_file: path.join(project, "never.json") }))
  writeFileSync(`${dead}.owner`, JSON.stringify({ pid: 2 ** 22 - 1 }))
  ext.releaseAbandoned(spool, { appendLine() {} })
  assert.deepEqual(readdirSync(spool).sort(), ["b.job.json"])
})

function readFileSyncText(file) {
  return require("node:fs").readFileSync(file, "utf8")
}

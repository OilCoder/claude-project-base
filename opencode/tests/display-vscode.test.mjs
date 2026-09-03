import assert from "node:assert/strict"
import { execFile as execFileCallback } from "node:child_process"
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { promisify } from "node:util"
import { fileURLToPath } from "node:url"

import { DISPLAYS, resolveDisplay, runAgentProcess, vscodeSpoolDirectory } from "../.opencode/codegen/lib/agent-run.mjs"

const execFile = promisify(execFileCallback)
const here = path.dirname(fileURLToPath(import.meta.url))

test("vscode display spools the job and completes when the extension's terminal runs the view", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codegen-vscode-"))
  const spool = path.join(root, "spool")
  const previous = process.env.CODEGEN_VSCODE_SPOOL
  const previousPath = process.env.PATH
  process.env.CODEGEN_VSCODE_SPOOL = spool
  // A fake `opencode` on PATH: the view runs the job command from the job's env.
  const bin = path.join(root, "bin")
  await mkdir(bin)
  await writeFile(path.join(bin, "opencode"), "#!/usr/bin/env bash\necho '{\"type\":\"text\",\"part\":{\"text\":\"hola\"}}'\n", { mode: 0o755 })
  process.env.PATH = `${bin}${path.delimiter}${previousPath}`
  try {
    assert.ok(DISPLAYS.includes("vscode"))
    assert.equal(resolveDisplay({ display: "vscode" }), "vscode")
    assert.equal(vscodeSpoolDirectory(), spool)

    // Fake extension: poll the spool, claim the job, run agent-view on it.
    const extension = (async () => {
      for (let i = 0; i < 100; i += 1) {
        const entries = (await readdir(spool).catch(() => [])).filter((entry) => entry.endsWith(".job.json"))
        if (entries.length > 0) {
          const jobFile = path.join(spool, entries[0])
          const job = JSON.parse(await readFile(jobFile, "utf8"))
          assert.equal(job.view_script, path.resolve(here, "../.opencode/codegen/scripts/agent-view.mjs"))
          assert.equal(job.header.title, "builder · demo")
          await execFile(process.execPath, [job.view_script, jobFile], { env: { ...process.env, CODEGEN_VIEW_HOLD: "0" } })
          await rm(jobFile)
          return job
        }
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      throw new Error("no job spooled")
    })()

    const result = await runAgentProcess({
      directory: root,
      args: ["run", "--format", "json", "--agent", "builder", "demo"],
      display: "vscode",
      artifacts: path.join(root, "artifacts"),
      header: { title: "builder · demo", agent: "builder", roles: ["Builder"], model: "x/y" },
      timeoutSeconds: 20,
      hold: false,
    }).then((value) => value, (error) => error)
    const job = await extension
    assert.equal(job.command, "opencode")
    assert.equal(result.exitCode, 0, result.stderr)
    assert.match(result.stdout, /"hola"/)
    assert.deepEqual(await readdir(spool), [], "the fake extension consumed the spool entry")
  } finally {
    if (previous === undefined) delete process.env.CODEGEN_VSCODE_SPOOL
    else process.env.CODEGEN_VSCODE_SPOOL = previous
    process.env.PATH = previousPath
    await rm(root, { recursive: true, force: true })
  }
})

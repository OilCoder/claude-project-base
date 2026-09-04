import assert from "node:assert/strict"
import { execFile as execFileCallback } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { promisify } from "node:util"

const execFile = promisify(execFileCallback)
const script = path.resolve(".opencode/codegen/scripts/merge-run.mjs")

async function repo() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "merge-run-"))
  const git = (...args) => execFile("git", ["-c", "user.name=t", "-c", "user.email=t@localhost", ...args], { cwd: directory })
  await git("init", "-q", "-b", "main")
  await writeFile(path.join(directory, "a.txt"), "a\n")
  await git("add", ".")
  await git("commit", "-q", "-m", "base")
  // A completed run whose branch is one commit ahead.
  await git("checkout", "-q", "-b", "codegen/r1")
  await writeFile(path.join(directory, "b.txt"), "b\n")
  await git("add", ".")
  await git("commit", "-q", "-m", "codegen(b)")
  await git("checkout", "-q", "main")
  await mkdir(path.join(directory, ".codegen-run/r1"), { recursive: true })
  await writeFile(path.join(directory, ".codegen-run/r1/state.json"), JSON.stringify({ run_id: "r1", status: "COMPLETED", integration_branch: "codegen/r1" }))
  await writeFile(path.join(directory, ".git/info/exclude"), ".codegen-run/\n")
  return { directory, git }
}

function run(directory, args = []) {
  return execFile(process.execPath, [script, ...args], { cwd: directory }).then(
    (r) => ({ code: 0, ...r }),
    (error) => ({ code: error.code, stdout: error.stdout, stderr: error.stderr }),
  )
}

test("merge-run fast-forwards the latest completed run and deletes its branch", async () => {
  const { directory, git } = await repo()
  try {
    const dirty = await writeFile(path.join(directory, "a.txt"), "changed\n").then(() => run(directory))
    assert.equal(JSON.parse(dirty.stdout).result, "DIRTY_CHECKOUT")
    await git("checkout", "-q", "--", "a.txt")

    const result = await run(directory)
    assert.equal(result.code, 0, result.stderr)
    const summary = JSON.parse(result.stdout)
    assert.equal(summary.result, "MERGED")
    assert.equal(summary.branch, "codegen/r1")
    assert.notEqual(summary.head_before, summary.head_after)
    const { stdout: log } = await git("log", "--oneline", "-1")
    assert.match(log, /codegen\(b\)/)
    const { stdout: branches } = await git("branch", "--list", "codegen/*")
    assert.equal(branches.trim(), "")

    const again = await run(directory)
    assert.equal(JSON.parse(again.stdout).result, "BRANCH_MISSING")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("merge-run refuses a merge that is not a fast-forward", async () => {
  const { directory, git } = await repo()
  try {
    await writeFile(path.join(directory, "c.txt"), "c\n")
    await git("add", ".")
    await git("commit", "-q", "-m", "diverged")
    const result = await run(directory)
    assert.equal(result.code, 1)
    assert.equal(JSON.parse(result.stdout).result, "NOT_FAST_FORWARD")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

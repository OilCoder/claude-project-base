#!/usr/bin/env node
// Merges the integration branch of a completed run into the user's current
// branch, fast-forward only, then removes the run's worktrees and the branch.
// The user's checkout must be clean; nothing is rebased or squashed.
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

import { parseArguments, requireGitHead } from "../lib/cli.mjs"
import { runProcess } from "../lib/process.mjs"

const RUN_ROOT = ".codegen-run"

async function git(directory, args) {
  return runProcess("git", args, { cwd: directory, timeoutSeconds: 120 })
}

async function latestCompletedRun(directory) {
  let entries = []
  try {
    entries = (await readdir(path.join(directory, RUN_ROOT))).sort().reverse()
  } catch {
    return null
  }
  for (const runId of entries) {
    try {
      const state = JSON.parse(await readFile(path.join(directory, RUN_ROOT, runId, "state.json"), "utf8"))
      if (state.status === "COMPLETED") return state
    } catch {
      // not a run
    }
  }
  return null
}

async function main() {
  const args = parseArguments(process.argv.slice(2))
  const directory = path.resolve(args.directory ?? process.cwd())
  await requireGitHead(directory)
  const summary = { result: null, branch: args.branch ?? null, run_id: args.run ?? null, head_before: null, head_after: null, reason: null }
  async function finish(result, reason = null, exitCode = result === "MERGED" ? 0 : 1) {
    summary.result = result
    summary.reason = reason
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
    process.exitCode = exitCode
  }

  let state = null
  if (!summary.branch) {
    state = args.run
      ? JSON.parse(await readFile(path.join(directory, RUN_ROOT, args.run, "state.json"), "utf8"))
      : await latestCompletedRun(directory)
    if (!state) return finish("NO_COMPLETED_RUN", "no run under .codegen-run/ finished with status COMPLETED")
    if (state.status !== "COMPLETED") return finish("RUN_NOT_COMPLETED", `run ${state.run_id} ended as ${state.status}`)
    summary.branch = state.integration_branch
    summary.run_id = state.run_id
  }
  const exists = await git(directory, ["rev-parse", "--verify", `refs/heads/${summary.branch}`])
  if (exists.exitCode !== 0) return finish("BRANCH_MISSING", `branch ${summary.branch} does not exist`)
  const status = await git(directory, ["status", "--porcelain"])
  if (status.stdout.trim()) return finish("DIRTY_CHECKOUT", "commit or stash your changes before merging")
  summary.head_before = (await git(directory, ["rev-parse", "HEAD"])).stdout.trim()

  const merge = await git(directory, ["merge", "--ff-only", summary.branch])
  if (merge.exitCode !== 0) return finish("NOT_FAST_FORWARD", merge.stderr.trim() || merge.stdout.trim())
  summary.head_after = (await git(directory, ["rev-parse", "HEAD"])).stdout.trim()

  // Housekeeping: the run's worktrees hold the branch checked out.
  const worktrees = await git(directory, ["worktree", "list", "--porcelain"])
  for (const line of worktrees.stdout.split("\n")) {
    if (line.startsWith("worktree ") && line.includes(`/${RUN_ROOT}/`)) {
      await git(directory, ["worktree", "remove", "--force", line.slice(9)])
    }
  }
  await git(directory, ["worktree", "prune"])
  await git(directory, ["branch", "-d", summary.branch])
  return finish("MERGED")
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 2
})

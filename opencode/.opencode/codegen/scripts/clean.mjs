#!/usr/bin/env node
// Lists the working artifacts of a project (Goal, plans, research, opinions,
// runs, run artifacts, stale worktrees) and removes them with --yes. Branches
// codegen/<run> are listed but never deleted: merging or dropping them is the
// user's decision.
import { rm, stat } from "node:fs/promises"
import path from "node:path"

import { runProcess } from "../lib/process.mjs"

const ARTIFACTS = [".codegen-goal", ".codegen-plan", ".codegen-research", ".codegen-opinions", ".codegen-run", ".opencode/codegen/runs"]

async function exists(filePath) {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

async function main() {
  const args = process.argv.slice(2)
  const yes = args.includes("--yes")
  const directory = path.resolve(args.find((arg) => !arg.startsWith("--")) ?? process.cwd())
  const present = []
  for (const relative of ARTIFACTS) if (await exists(path.join(directory, relative))) present.push(relative)
  const branches = await runProcess("git", ["branch", "--list", "codegen/*", "--format=%(refname:short)"], { cwd: directory, timeoutSeconds: 30 })
  const worktrees = await runProcess("git", ["worktree", "list", "--porcelain"], { cwd: directory, timeoutSeconds: 30 })
  const codegenWorktrees = worktrees.stdout.split("\n").filter((line) => line.startsWith("worktree ") && line.includes("/.codegen-run/")).map((line) => line.slice(9))

  process.stdout.write(`${yes ? "Removing" : "Would remove"} in ${directory}:\n`)
  for (const relative of present) process.stdout.write(`  ${relative}/\n`)
  for (const worktree of codegenWorktrees) process.stdout.write(`  worktree ${worktree}\n`)
  if (present.length === 0 && codegenWorktrees.length === 0) process.stdout.write("  (nothing)\n")
  const branchList = branches.stdout.trim().split("\n").filter(Boolean)
  if (branchList.length) process.stdout.write(`Kept branches (merge or delete them yourself): ${branchList.join(", ")}\n`)
  if (!yes) {
    process.stdout.write("Run again with --yes to remove them.\n")
    return
  }
  for (const worktree of codegenWorktrees) await runProcess("git", ["worktree", "remove", "--force", worktree], { cwd: directory, timeoutSeconds: 60 })
  await runProcess("git", ["worktree", "prune"], { cwd: directory, timeoutSeconds: 30 })
  for (const relative of present) await rm(path.join(directory, relative), { recursive: true, force: true })
  process.stdout.write("Done.\n")
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 2
})

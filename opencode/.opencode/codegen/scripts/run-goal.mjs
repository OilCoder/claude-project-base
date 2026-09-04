#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { runExecutionPlan, selectExecutionPlan } from "../lib/builder-runner.mjs"
import {
  exists,
  loadRegistry,
  newRunId,
  parseArguments,
  requireGitHead,
  resolveInsideProject,
  resolveMinimumStatus,
  resolvePinnedConfiguration,
  runsDirectory,
} from "../lib/cli.mjs"
import { routeGoal } from "../lib/goal-routing.mjs"
import { renderGoalMarkdown, sealApprovedGoal, validateGoal } from "../lib/goal.mjs"
import { resolveDisplay, runAgentProcess } from "../lib/agent-run.mjs"
import { runProcess } from "../lib/process.mjs"
import { validateResearchReport } from "../lib/research-report.mjs"

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const systemRoot = path.resolve(scriptDirectory, "../../..")

// The Goal Manager structures intent with a configuration admitted for its own role.
// Approval is deterministic: the user approved this exact Goal, so it is sealed
// in place without another model call. Nothing else changes.
async function approve(directory, goalArgument) {
  const goalFile = resolveInsideProject(directory, goalArgument, "Goal")
  if (!(await exists(goalFile.absolute))) throw new Error(`Goal does not exist: ${goalFile.relative}`)
  const goal = JSON.parse(await readFile(goalFile.absolute, "utf8"))
  const sealed = sealApprovedGoal(goal)
  await writeFile(goalFile.absolute, `${JSON.stringify(sealed, null, 2)}\n`)
  const markdown = path.join(path.dirname(goalFile.absolute), "GOAL.md")
  await writeFile(markdown, renderGoalMarkdown(sealed))
  const routing = routeGoal(sealed)
  const summary = {
    result: "SEALED",
    operation: "approve",
    output: goalFile.relative,
    markdown: path.relative(directory, markdown),
    goal_id: sealed.goal_id,
    previous_status: goal.status,
    routing,
  }
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
  process.exitCode = routing.status === "ROUTED" ? 0 : 1
}

async function main() {
  const args = parseArguments(process.argv.slice(2))
  const directory = path.resolve(args.directory ?? process.cwd())
  await requireGitHead(directory)
  if (args.approve) return approve(directory, args.approve)
  if (!args.intent) {
    throw new Error(
      "usage: run-goal.mjs --intent <text> [--reports a.json,b.json] [--output .codegen-goal/goal.json] [--allow-sealed true] | --approve <goal.json>",
    )
  }
  const minimumStatus = await resolveMinimumStatus(args, systemRoot)
  const configurationId = await resolvePinnedConfiguration(args, systemRoot)
  const output = resolveInsideProject(
    directory,
    args.output ?? ".codegen-goal/goal.json",
    "Goal output",
  )
  if (await exists(output.absolute)) throw new Error(`Goal output already exists: ${output.relative}`)

  const reports = []
  for (const item of (args.reports ?? "").split(",").map((value) => value.trim()).filter(Boolean)) {
    const file = resolveInsideProject(directory, item, "Research report")
    const report = JSON.parse(await readFile(file.absolute, "utf8"))
    const validation = validateResearchReport(report)
    if (!validation.valid) {
      throw new Error(`Research report ${file.relative} is invalid: ${validation.errors.join("; ")}`)
    }
    reports.push({ path: file.relative, report_id: report.report_id, question_id: report.question_id })
  }

  const registry = await loadRegistry(systemRoot)
  const plan = selectExecutionPlan(registry, "goal-manager", {
    workClass: "complex-engineering-plan",
    risk: args.risk ?? "medium",
    minimumStatus,
    configurationId,
    requiredContext: Number(args["required-context"] ?? 0),
    requiresTools: true,
    requiresCodeEditing: false,
  })
  if (plan.status !== "READY") {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`)
    process.exitCode = 2
    return
  }

  await mkdir(path.dirname(output.absolute), { recursive: true })
  const runId = newRunId()
  const artifacts = runsDirectory(systemRoot, "goal", runId)
  await mkdir(artifacts, { recursive: true })
  const display = resolveDisplay(args)
  const prompt = [
    `Convert this user intent into a Goal: ${args.intent}`,
    `Write the complete Goal to ${output.relative}.`,
    reports.length > 0
      ? `Use these validated research reports as evidence: ${reports.map((item) => `${item.path} (${item.report_id}, answers ${item.question_id})`).join("; ")}.`
      : "No research reports are available; turn unknown facts into research_questions.",
    args["allow-sealed"] === "true"
      ? "The user has explicitly approved sealing this Goal if nothing blocks it."
      : "Leave status DRAFT, RESEARCHING, or DECIDED; the user has not approved sealing. Do not plan implementation or write product code.",
  ].join("\n")

  const execution = await runExecutionPlan({
    plan,
    execute: async (configuration, attemptNumber) => {
      const result = await runAgentProcess({
        directory,
        args: ["run", "--format", "json", "--model", configuration.model, "--agent", "goal-manager", prompt],
        timeoutSeconds: Number(args.timeout ?? 600),
        display,
        title: `goal-manager · ${output.relative}`,
      })
      return {
        exitCode: result.exitCode,
        signal: result.signal,
        eventsText: result.stdout,
        stderr: result.stderr,
        changedFiles: (await exists(output.absolute)) ? [output.relative] : [],
      }
    },
  })

  let result = execution.status
  let validation = null
  let routing = null
  let markdown = null
  if (result === "SUCCESS" && !(await exists(output.absolute))) result = "GOAL_NOT_WRITTEN"
  if (result === "SUCCESS") {
    try {
      const goal = JSON.parse(await readFile(output.absolute, "utf8"))
      validation = validateGoal(goal)
      if (validation.valid && goal.status === "SEALED" && args["allow-sealed"] !== "true") {
        // Only the user seals a Goal. A model that returns SEALED without that
        // approval is rejected here, before anything downstream can route it.
        validation = {
          valid: false,
          errors: ["Goal returned SEALED without explicit user approval (--allow-sealed true)"],
        }
        result = "SEALED_WITHOUT_APPROVAL"
      } else if (validation.valid) {
        markdown = path.join(path.dirname(output.absolute), "GOAL.md")
        await writeFile(markdown, renderGoalMarkdown(goal))
        routing = routeGoal(goal)
        result = goal.status
      } else {
        result = "GOAL_INVALID"
      }
    } catch (error) {
      validation = { valid: false, errors: [`Goal is not valid JSON: ${error.message}`] }
      result = "GOAL_INVALID"
    }
  }

  const summary = {
    result,
    output: output.relative,
    markdown: markdown ? path.relative(directory, markdown) : null,
    research_reports: reports,
    user_action: execution.user_action,
    attempts: execution.attempts,
    validation,
    routing,
    artifacts,
  }
  await writeFile(path.join(artifacts, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
  process.exitCode = validation?.valid ? 0 : 1
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 2
})

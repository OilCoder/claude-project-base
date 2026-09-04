#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  runExecutionPlan,
  selectExecutionPlan,
} from "../lib/builder-runner.mjs"
import { validatePlan } from "../lib/plan-validation.mjs"
import {
  exists,
  loadRegistry,
  newRunId,
  parseArguments,
  requireGitHead,
  resolveMinimumStatus,
  resolvePinnedConfiguration,
  runsDirectory,
} from "../lib/cli.mjs"
import { resolveDisplay, runAgentProcess } from "../lib/agent-run.mjs"
import { runProcess } from "../lib/process.mjs"

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const systemRoot = path.resolve(scriptDirectory, "../../..")

async function main() {
  const args = parseArguments(process.argv.slice(2))
  if (!args.objective) {
    throw new Error(
      "usage: run-planner.mjs --objective <text> [--goal <path>] [--output .codegen-plan/plan.json] [--max-contracts <n>] [--evidence <rejected-plan-evidence.json>]",
    )
  }
  const directory = path.resolve(args.directory ?? process.cwd())
  await requireGitHead(directory)
  const minimumStatus = await resolveMinimumStatus(args, systemRoot)
  const configurationId = await resolvePinnedConfiguration(args, systemRoot)
  const outputPath = path.resolve(directory, args.output ?? ".codegen-plan/plan.json")
  const relativeOutput = path.relative(directory, outputPath)
  if (relativeOutput.startsWith("..") || path.isAbsolute(relativeOutput)) {
    throw new Error("Planner output must be inside the target project")
  }
  if (await exists(outputPath)) throw new Error(`Planner output already exists: ${relativeOutput}`)
  await mkdir(path.dirname(outputPath), { recursive: true })

  const registry = await loadRegistry(systemRoot)
  const plan = selectExecutionPlan(registry, "planner", {
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

  const runId = newRunId()
  const artifacts = runsDirectory(systemRoot, "planner", runId)
  await mkdir(artifacts, { recursive: true })
  const display = resolveDisplay(args)
  const maxContracts = args["max-contracts"] ? Number(args["max-contracts"]) : null
  const evidencePath = args.evidence ? path.resolve(directory, args.evidence) : null
  const evidence = evidencePath ? JSON.parse(await readFile(evidencePath, "utf8")) : null
  const prompt = [
    `Plan this objective: ${args.objective}`,
    ...(args.goal ? [`The sealed Goal with requirements, constraints, and acceptance criteria is at ${args.goal}; read it first.`] : []),
    `Write the complete plan to ${relativeOutput}.`,
    `Use only these work_class values: ${Object.keys(registry.routes).join(", ")}.`,
    "Paths in allowed_to_modify are exact file paths or dir/**; read and forbidden also accept *.ext globs. Never use other wildcards.",
    ...(evidence
      ? [
          `This is a retry. The previous plan (${path.relative(directory, evidencePath)}) was rejected by the deterministic validator with these errors: ${(evidence.errors ?? []).join("; ")}. Fix exactly those problems and keep everything else.`,
        ]
      : []),
    ...(maxContracts === 1
      ? ["This objective took the direct route: write exactly one phase containing exactly one contract."]
      : []),
    "Do not implement product code. If blocked, do not create the plan file.",
  ].join("\n")

  const execution = await runExecutionPlan({
    plan,
    execute: async (configuration, attemptNumber) => {
      const result = await runAgentProcess({
        directory,
        args: ["run", "--format", "json", "--model", configuration.model, "--agent", "planner", prompt],
        timeoutSeconds: Number(args.timeout ?? 900),
        display,
        title: `planner · ${relativeOutput}`,
      })
      return {
        exitCode: result.exitCode,
        signal: result.signal,
        eventsText: result.stdout,
        stderr: result.stderr,
        changedFiles: (await exists(outputPath)) ? [relativeOutput] : [],
      }
    },
  })

  let result = execution.status
  let validation = null
  if (result === "SUCCESS" && !(await exists(outputPath))) result = "PLAN_NOT_WRITTEN"
  if (result === "SUCCESS") {
    try {
      const generatedPlan = JSON.parse(await readFile(outputPath, "utf8"))
      validation = validatePlan(generatedPlan, {
        workClasses: new Set(Object.keys(registry.routes)),
        maxContracts,
      })
      const revision = await runProcess("git", ["rev-parse", "HEAD"], {
        cwd: directory,
        timeoutSeconds: 30,
      })
      if (
        revision.exitCode !== 0 ||
        generatedPlan.base_revision !== revision.stdout.trim()
      ) {
        validation.errors.push("base_revision does not match the current Git HEAD")
        validation.valid = false
      }
      result = validation.valid ? "PASS" : "PLAN_INVALID"
    } catch (error) {
      validation = { valid: false, errors: [`Plan is not valid JSON: ${error.message}`] }
      result = "PLAN_INVALID"
    }
  }

  const report = {
    result,
    output: relativeOutput,
    user_action: execution.user_action,
    attempts: execution.attempts,
    validation,
    artifacts,
  }
  await writeFile(path.join(artifacts, "summary.json"), `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  process.exitCode = result === "PASS" ? 0 : 1
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 2
})
